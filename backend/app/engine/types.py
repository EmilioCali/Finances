from dataclasses import dataclass
from decimal import Decimal

from app.engine.money import json_number


@dataclass(frozen=True)
class Line:
    id: str
    company_id: str
    period: str
    category_raw: str
    category: str
    record_type: str
    currency: str
    amount_original: Decimal
    source_file: str
    source_row: int


@dataclass(frozen=True)
class Adjustment:
    type: str
    percentage: Decimal
    currency: str | None = None
    company_id: str | None = None

    def as_json(self) -> dict:
        return {
            "type": self.type,
            "currency": self.currency,
            "percentage": json_number(self.percentage),
            "companyId": self.company_id,
        }
