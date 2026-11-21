from decimal import Decimal
from itertools import combinations

from app.engine.aggregate import aggregate, category_sort, company_sort
from app.engine.fx import BASE_RATES, RATE_ORDER, fx_table
from app.engine.money import HUNDRED, money_str, usd_amount, variance_pair
from app.engine.types import Adjustment, Line
from app.errors import DomainError


def validate_adjustments(adjustments: list[Adjustment], company_ids: set[str]) -> None:
    details: list[dict] = []
    for index, adjustment in enumerate(adjustments):
        prefix = f"adjustments[{index}]"
        if adjustment.type in {"REVENUE", "OPERATING_COST"}:
            if adjustment.percentage < Decimal("-90") or adjustment.percentage > Decimal("200"):
                details.append(
                    {
                        "field": f"{prefix}.percentage",
                        "message": "El porcentaje debe estar entre -90 y 200.",
                    }
                )
        elif adjustment.type == "EXCHANGE_RATE":
            if adjustment.currency not in BASE_RATES:
                details.append(
                    {
                        "field": f"{prefix}.currency",
                        "message": "El tipo de cambio exige una moneda GTQ, USD o MXN.",
                    }
                )
            if adjustment.percentage <= Decimal("-99") or adjustment.percentage > Decimal("200"):
                details.append(
                    {
                        "field": f"{prefix}.percentage",
                        "message": "El porcentaje del tipo de cambio debe ser mayor que -99 y menor o igual a 200.",
                    }
                )
            elif adjustment.currency in BASE_RATES:
                rate = BASE_RATES[adjustment.currency] * (Decimal("1") + adjustment.percentage / HUNDRED)
                if rate <= 0:
                    details.append(
                        {
                            "field": f"{prefix}.percentage",
                            "message": "La tasa resultante debe ser mayor que cero.",
                        }
                    )
        if adjustment.company_id and adjustment.company_id not in company_ids:
            details.append(
                {
                    "field": f"{prefix}.companyId",
                    "message": "No se encontró la empresa.",
                }
            )
    if details:
        only_missing_company = all(item["field"].endswith("companyId") for item in details)
        status = 404 if only_missing_company else 400
        code = "NOT_FOUND" if only_missing_company else "VALIDATION_ERROR"
        message = details[0]["message"] if len(details) == 1 else f"Hay {len(details)} errores de validación."
        raise DomainError(status, code, message, details)

    for left, right in combinations(adjustments, 2):
        if _overlaps(left, right):
            raise DomainError(
                409,
                "CONFLICT",
                "Hay ajustes del mismo tipo con alcances que se solapan.",
                [
                    {
                        "field": "adjustments",
                        "message": "Dos ajustes del mismo tipo no pueden cubrir la misma empresa o moneda.",
                    }
                ],
            )


def project_line(line: Line, adjustments: list[Adjustment]) -> tuple[Decimal, Decimal]:
    local = line.amount_original
    rate = BASE_RATES[line.currency]
    for adjustment in adjustments:
        if not _matches(line, adjustment):
            continue
        factor = Decimal("1") + (adjustment.percentage / HUNDRED)
        if adjustment.type in {"REVENUE", "OPERATING_COST"}:
            local = line.amount_original * factor
        elif adjustment.type == "EXCHANGE_RATE":
            rate = BASE_RATES[line.currency] * factor
    if local <= 0:
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "El ajuste dejaría un importe menor o igual a cero.",
        )
    if rate <= 0:
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "La tasa resultante debe ser mayor que cero.",
        )
    return local, rate


def build_results(
    lines: list[Line],
    adjustments: list[Adjustment],
    scenario_id: str,
    name: str,
) -> dict:
    base_amounts = {
        line.id: usd_amount(line.amount_original, BASE_RATES[line.currency])
        for line in lines
    }
    simulated_amounts: dict[str, Decimal] = {}
    observed_rates: dict[str, set[Decimal]] = {code: set() for code in RATE_ORDER}
    for line in lines:
        local, rate = project_line(line, adjustments)
        simulated_amounts[line.id] = usd_amount(local, rate)
        observed_rates[line.currency].add(rate)

    base = aggregate(lines, base_amounts)
    simulated = aggregate(lines, simulated_amounts)
    companies = sorted(set(base.by_company) | set(simulated.by_company), key=company_sort)
    categories = sorted(set(base.by_category) | set(simulated.by_category), key=category_sort)
    periods = sorted(set(base.by_period) | set(simulated.by_period))

    return {
        "scenarioId": scenario_id,
        "name": name,
        "reportingCurrency": "USD",
        "adjustments": [adjustment.as_json() for adjustment in adjustments],
        "fxRates": {
            "base": fx_table(),
            "simulated": _simulated_rates(adjustments, observed_rates),
        },
        "base": base.totals.as_json(),
        "simulated": simulated.totals.as_json(),
        "variance": {
            "revenue": variance_pair(base.totals.revenue, simulated.totals.revenue),
            "expense": variance_pair(base.totals.expense, simulated.totals.expense),
            "operatingResult": variance_pair(
                base.totals.operating_result,
                simulated.totals.operating_result,
            ),
        },
        "byCompany": [
            _company_comparison(company_id, base, simulated) for company_id in companies
        ],
        "byCategory": [
            _category_comparison(key, base, simulated) for key in categories
        ],
        "series": [_period_comparison(period, base, simulated) for period in periods],
    }


def _matches(line: Line, adjustment: Adjustment) -> bool:
    if adjustment.company_id is not None and adjustment.company_id != line.company_id:
        return False
    if adjustment.type == "REVENUE":
        return line.record_type == "REVENUE"
    if adjustment.type == "OPERATING_COST":
        return line.record_type == "EXPENSE"
    if adjustment.type == "EXCHANGE_RATE":
        return line.currency == adjustment.currency
    return False


def _overlaps(left: Adjustment, right: Adjustment) -> bool:
    if left.type != right.type:
        return False
    if left.type == "EXCHANGE_RATE" and left.currency != right.currency:
        return False
    if left.company_id is None or right.company_id is None:
        return True
    return left.company_id == right.company_id


def _simulated_rates(
    adjustments: list[Adjustment],
    observed_rates: dict[str, set[Decimal]],
) -> list[dict]:
    rates: dict[str, Decimal] = {}
    for currency in RATE_ORDER:
        observed = observed_rates.get(currency, set())
        if len(observed) == 1:
            rates[currency] = next(iter(observed))
        elif len(observed) == 0:
            rates[currency] = _rate_without_lines(currency, adjustments)
        else:
            # Hay más de una tasa para la misma moneda. El total de cada línea
            # usa la suya; el resumen no puede mostrar las dos.
            rates[currency] = BASE_RATES[currency]
    return fx_table(rates)


def _rate_without_lines(currency: str, adjustments: list[Adjustment]) -> Decimal:
    applicable = [
        adjustment
        for adjustment in adjustments
        if adjustment.type == "EXCHANGE_RATE" and adjustment.currency == currency
    ]
    if len(applicable) == 1:
        factor = Decimal("1") + applicable[0].percentage / HUNDRED
        return BASE_RATES[currency] * factor
    return BASE_RATES[currency]


def _company_comparison(company_id: str, base, simulated) -> dict:
    base_totals = base.by_company.get(company_id)
    simulated_totals = simulated.by_company.get(company_id)
    from app.engine.aggregate import Totals

    base_totals = base_totals or Totals()
    simulated_totals = simulated_totals or Totals()
    return {
        "companyId": company_id,
        "base": base_totals.as_json(),
        "simulated": simulated_totals.as_json(),
        "variance": {
            "revenue": variance_pair(base_totals.revenue, simulated_totals.revenue),
            "expense": variance_pair(base_totals.expense, simulated_totals.expense),
            "operatingResult": variance_pair(
                base_totals.operating_result,
                simulated_totals.operating_result,
            ),
        },
    }


def _category_comparison(key: tuple[str, str], base, simulated) -> dict:
    category, record_type = key
    base_amount = base.by_category.get(key, Decimal("0"))
    simulated_amount = simulated.by_category.get(key, Decimal("0"))
    return {
        "category": category,
        "recordType": record_type,
        "base": money_str(base_amount),
        "simulated": money_str(simulated_amount),
        "variance": variance_pair(base_amount, simulated_amount),
    }


def _period_comparison(period: str, base, simulated) -> dict:
    from app.engine.aggregate import Totals

    base_totals = base.by_period.get(period) or Totals()
    simulated_totals = simulated.by_period.get(period) or Totals()
    return {
        "period": period,
        "base": base_totals.as_json(),
        "simulated": simulated_totals.as_json(),
    }
