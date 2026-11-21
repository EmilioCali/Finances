from decimal import Decimal

from app.engine.money import rate_str

RATE_ORDER = ("GTQ", "USD", "MXN")

BASE_RATES = {
    "GTQ": Decimal("7.75"),
    "USD": Decimal("1"),
    "MXN": Decimal("18"),
}


def fx_table(rates: dict[str, Decimal] | None = None) -> list[dict]:
    source = BASE_RATES if rates is None else rates
    return [
        {"currency": code, "unitsPerUsd": rate_str(source[code])}
        for code in RATE_ORDER
    ]
