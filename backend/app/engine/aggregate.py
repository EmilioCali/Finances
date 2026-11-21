from dataclasses import dataclass, field
from decimal import Decimal

from app.engine.types import Line

COMPANY_ORDER = {"company-gt": 0, "company-us": 1, "company-mx": 2}
CATEGORY_ORDER = {"SALES": 0, "OTHER_INCOME": 1, "OPERATING_COST": 2}


@dataclass
class Totals:
    revenue: Decimal = Decimal("0")
    expense: Decimal = Decimal("0")

    @property
    def operating_result(self) -> Decimal:
        return self.revenue - self.expense

    def add(self, record_type: str, amount: Decimal) -> None:
        if record_type == "REVENUE":
            self.revenue += amount
        else:
            self.expense += amount

    def as_json(self) -> dict:
        from app.engine.money import money_str

        return {
            "revenue": money_str(self.revenue),
            "expense": money_str(self.expense),
            "operatingResult": money_str(self.operating_result),
        }


@dataclass
class Aggregate:
    totals: Totals = field(default_factory=Totals)
    by_company: dict[str, Totals] = field(default_factory=dict)
    by_category: dict[tuple[str, str], Decimal] = field(default_factory=dict)
    by_period: dict[str, Totals] = field(default_factory=dict)


def aggregate(lines: list[Line], amounts: dict[str, Decimal]) -> Aggregate:
    result = Aggregate()
    for line in lines:
        amount = amounts[line.id]
        result.totals.add(line.record_type, amount)
        result.by_company.setdefault(line.company_id, Totals()).add(line.record_type, amount)
        key = (line.category, line.record_type)
        result.by_category[key] = result.by_category.get(key, Decimal("0")) + amount
        result.by_period.setdefault(line.period, Totals()).add(line.record_type, amount)
    return result


def company_sort(company_id: str) -> tuple:
    return (COMPANY_ORDER.get(company_id, 99), company_id)


def category_sort(key: tuple[str, str]) -> tuple:
    return (CATEGORY_ORDER.get(key[0], 99), key[0], key[1])
