import re
import unicodedata

CATALOG = {
    "SALES": "REVENUE",
    "OTHER_INCOME": "REVENUE",
    "OPERATING_COST": "EXPENSE",
}

ALIASES = {
    "ventas": "SALES",
    "sales": "SALES",
    "ingresos": "SALES",
    "revenue": "SALES",
    "otros ingresos": "OTHER_INCOME",
    "other income": "OTHER_INCOME",
    "costos operativos": "OPERATING_COST",
    "opex": "OPERATING_COST",
    "gastos": "OPERATING_COST",
    "gastos operativos": "OPERATING_COST",
    "nomina": "OPERATING_COST",
    "salarios": "OPERATING_COST",
    "renta": "OPERATING_COST",
    "alquiler": "OPERATING_COST",
    "operating cost": "OPERATING_COST",
}

PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
AMOUNT_RE = re.compile(r"\d+(\.\d+)?")


def fold(value: str) -> str:
    text = value.strip().lower()
    without_accents = "".join(
        char
        for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )
    return " ".join(without_accents.split())


def resolve_category(raw: str) -> str | None:
    text = raw.strip()
    if not text:
        return None
    code = re.sub(r"[\s]+", "_", text.upper())
    if code in CATALOG:
        return code
    return ALIASES.get(fold(text))
