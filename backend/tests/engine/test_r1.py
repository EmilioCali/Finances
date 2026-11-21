from decimal import Decimal

from app.engine.consolidation import consolidate
from app.engine.money import money_str
from app.engine.simulation import build_results, project_line, validate_adjustments
from app.engine.types import Adjustment, Line
from app.errors import DomainError

CRISIS = [
    Adjustment("EXCHANGE_RATE", Decimal("10"), currency="GTQ"),
    Adjustment("OPERATING_COST", Decimal("8"), company_id="company-gt"),
]


def _line(line_id, company_id, period, raw, category, record_type, currency, amount, row) -> Line:
    return Line(
        id=line_id,
        company_id=company_id,
        period=period,
        category_raw=raw,
        category=category,
        record_type=record_type,
        currency=currency,
        amount_original=Decimal(amount),
        source_file="r1.csv",
        source_row=row,
    )


def r1_lines() -> list[Line]:
    return [
        _line("gt-rev", "company-gt", "2026-01", "Ventas", "SALES", "REVENUE", "GTQ", "77500", 2),
        _line("gt-exp", "company-gt", "2026-01", "Costos operativos", "OPERATING_COST", "EXPENSE", "GTQ", "38750", 3),
        _line("us-rev", "company-us", "2026-01", "SALES", "SALES", "REVENUE", "USD", "8000", 2),
        _line("us-exp", "company-us", "2026-01", "OPERATING_COST", "OPERATING_COST", "EXPENSE", "USD", "3000", 3),
        _line("mx-rev", "company-mx", "2026-01", "SALES", "SALES", "REVENUE", "MXN", "180000", 2),
        _line("mx-exp", "company-mx", "2026-01", "OPERATING_COST", "OPERATING_COST", "EXPENSE", "MXN", "90000", 3),
    ]


def test_money_half_up():
    assert money_str(Decimal("1.005")) == "1.01"
    assert money_str(Decimal("1.004")) == "1.00"


def test_r1_base_and_crisis_round_trip():
    lines = r1_lines()
    originals = [line.amount_original for line in lines]
    base = consolidate(lines, "2026-01")
    assert base["totals"] == {
        "revenue": "28000.00",
        "expense": "13000.00",
        "operatingResult": "15000.00",
    }
    assert base["fxRates"][0] == {"currency": "GTQ", "unitsPerUsd": "7.7500"}

    result = build_results(lines, CRISIS, "scn_01", "Crisis Guatemala")
    assert [line.amount_original for line in lines] == originals
    assert consolidate(lines, "2026-01")["totals"]["operatingResult"] == "15000.00"

    assert result["fxRates"]["simulated"][0] == {"currency": "GTQ", "unitsPerUsd": "8.5250"}
    assert result["base"]["operatingResult"] == "15000.00"
    assert result["simulated"] == {
        "revenue": "27090.91",
        "expense": "12909.09",
        "operatingResult": "14181.82",
    }
    assert result["variance"]["operatingResult"] == {"absolute": "-818.18", "percentage": "-5.45"}
    assert result["variance"]["revenue"] == {"absolute": "-909.09", "percentage": "-3.25"}
    assert result["variance"]["expense"] == {"absolute": "-90.91", "percentage": "-0.70"}

    guatemala = result["byCompany"][0]
    assert guatemala["companyId"] == "company-gt"
    assert guatemala["simulated"] == {
        "revenue": "9090.91",
        "expense": "4909.09",
        "operatingResult": "4181.82",
    }
    assert guatemala["variance"]["revenue"]["percentage"] == "-9.09"
    assert guatemala["variance"]["expense"]["percentage"] == "-1.82"
    assert guatemala["variance"]["operatingResult"]["percentage"] == "-16.36"

    united_states = result["byCompany"][1]
    assert united_states["companyId"] == "company-us"
    assert united_states["simulated"] == united_states["base"]
    assert result["byCompany"][2]["simulated"] == result["byCompany"][2]["base"]
    assert result["byCategory"][0]["simulated"] == "27090.91"
    assert result["series"][0]["simulated"]["operatingResult"] == "14181.82"


def test_extra_month_does_not_change_january_r1():
    lines = r1_lines() + [
        _line("gt-rev-2", "company-gt", "2026-02", "Ventas", "SALES", "REVENUE", "GTQ", "85250", 4),
    ]
    result = build_results(lines, CRISIS, "scn_02", "Crisis Guatemala")
    january = next(point for point in result["series"] if point["period"] == "2026-01")
    assert january["base"]["operatingResult"] == "15000.00"
    assert january["simulated"]["operatingResult"] == "14181.82"
    assert result["simulated"]["operatingResult"] != "14181.82"


def test_zero_base_percentage_is_null():
    result = build_results([], [], "scn_empty", "Vacío")
    assert result["variance"]["operatingResult"]["percentage"] is None
    assert result["variance"]["operatingResult"]["absolute"] == "0.00"


def test_negative_percentage_and_invalid_rate_are_rejected():
    companies = {"company-gt", "company-us", "company-mx"}
    try:
        validate_adjustments(
            [Adjustment("OPERATING_COST", Decimal("-91"), company_id="company-gt")],
            companies,
        )
        raise AssertionError("debía rechazar -91")
    except DomainError as exc:
        assert exc.status_code == 400

    try:
        validate_adjustments(
            [Adjustment("EXCHANGE_RATE", Decimal("-99"), currency="GTQ")],
            companies,
        )
        raise AssertionError("debía rechazar -99")
    except DomainError as exc:
        assert exc.status_code == 400

    validate_adjustments(
        [Adjustment("OPERATING_COST", Decimal("-90")), Adjustment("EXCHANGE_RATE", Decimal("200"), currency="GTQ")],
        companies,
    )

    line = r1_lines()[0]
    try:
        project_line(line, [Adjustment("REVENUE", Decimal("-100"))])
        raise AssertionError("el importe no puede quedar en cero")
    except DomainError as exc:
        assert exc.status_code == 400


def test_overlapping_adjustments_conflict():
    companies = {"company-gt", "company-us"}
    try:
        validate_adjustments(
            [
                Adjustment("REVENUE", Decimal("10")),
                Adjustment("REVENUE", Decimal("5"), company_id="company-gt"),
            ],
            companies,
        )
        raise AssertionError("debía marcar solape")
    except DomainError as exc:
        assert exc.status_code == 409

    validate_adjustments(
        [
            Adjustment("REVENUE", Decimal("10"), company_id="company-gt"),
            Adjustment("REVENUE", Decimal("5"), company_id="company-us"),
            Adjustment("EXCHANGE_RATE", Decimal("10"), currency="GTQ"),
            Adjustment("OPERATING_COST", Decimal("8"), company_id="company-gt"),
        ],
        companies,
    )
