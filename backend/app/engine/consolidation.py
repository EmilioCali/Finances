from decimal import Decimal

from app.engine.aggregate import Aggregate, aggregate, category_sort, company_sort
from app.engine.fx import BASE_RATES, fx_table
from app.engine.money import money_str, original_str, rate_str, usd_amount
from app.engine.types import Line


def consolidate(lines: list[Line], period: str | None = None) -> dict:
    selected = [line for line in lines if period is None or line.period == period]
    amounts = {
        line.id: usd_amount(line.amount_original, BASE_RATES[line.currency])
        for line in selected
    }
    grouped = aggregate(selected, amounts)
    ordered = sorted(
        selected,
        key=lambda line: (line.period, company_sort(line.company_id), line.source_row, line.id),
    )
    return {
        "reportingCurrency": "USD",
        "period": period,
        "fxRates": fx_table(),
        "totals": grouped.totals.as_json(),
        "byCompany": _companies(grouped),
        "byCategory": _categories(grouped),
        "series": _series(grouped),
        "lines": [_line_json(line, amounts[line.id]) for line in ordered],
    }


def _companies(grouped: Aggregate) -> list[dict]:
    return [
        {"companyId": company_id, **grouped.by_company[company_id].as_json()}
        for company_id in sorted(grouped.by_company, key=company_sort)
    ]


def _categories(grouped: Aggregate) -> list[dict]:
    return [
        {
            "category": category,
            "recordType": record_type,
            "amount": money_str(amount),
        }
        for (category, record_type), amount in sorted(
            grouped.by_category.items(),
            key=lambda item: category_sort(item[0]),
        )
    ]


def _series(grouped: Aggregate) -> list[dict]:
    return [
        {"period": period, **grouped.by_period[period].as_json()}
        for period in sorted(grouped.by_period)
    ]


def _line_json(line: Line, reporting: Decimal) -> dict:
    return {
        "id": line.id,
        "companyId": line.company_id,
        "period": line.period,
        "categoryRaw": line.category_raw,
        "category": line.category,
        "recordType": line.record_type,
        "currency": line.currency,
        "amountOriginal": original_str(line.amount_original),
        "fxRate": rate_str(BASE_RATES[line.currency]),
        "amountReporting": money_str(reporting),
        "sourceFile": line.source_file,
        "sourceRow": line.source_row,
    }
