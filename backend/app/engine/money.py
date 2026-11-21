from decimal import Decimal, ROUND_HALF_UP

MONEY = Decimal("0.01")
RATE = Decimal("0.0001")
HUNDRED = Decimal("100")


def money_str(value: Decimal) -> str:
    return format(value.quantize(MONEY, rounding=ROUND_HALF_UP), "f")


def rate_str(value: Decimal) -> str:
    return format(value.quantize(RATE, rounding=ROUND_HALF_UP), "f")


def original_str(value: Decimal) -> str:
    """El original se guarda exacto. Si cabe en centavos, se muestra con dos decimales."""
    cents = value.quantize(MONEY, rounding=ROUND_HALF_UP)
    if value == cents:
        return format(cents, "f")
    return format(value, "f")


def usd_amount(local: Decimal, rate: Decimal) -> Decimal:
    # D-007: el único redondeo del cálculo es este, al pasar a USD.
    return (local / rate).quantize(MONEY, rounding=ROUND_HALF_UP)


def json_number(value: Decimal) -> int | float:
    integral = value.to_integral_value()
    if value == integral:
        return int(integral)
    return float(value)


def variance_pair(base: Decimal, simulated: Decimal) -> dict:
    absolute = simulated - base
    if base == 0:
        percentage = None
    else:
        percentage = money_str((absolute / base) * HUNDRED)
    return {"absolute": money_str(absolute), "percentage": percentage}
