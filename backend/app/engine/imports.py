import csv
import io
import math
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook

from app.engine.catalog import AMOUNT_RE, CATALOG, PERIOD_RE, resolve_category
from app.engine.money import original_str
from app.errors import DomainError

REQUIRED_COLUMNS = ["period", "category", "record_type", "currency", "amount"]


@dataclass
class RowOutcome:
    row: int
    category_raw: str
    status: str
    period: str | None = None
    category: str | None = None
    record_type: str | None = None
    currency: str | None = None
    amount: Decimal | None = None
    field: str | None = None
    message: str | None = None


def load_table(filename: str, content: bytes) -> list[dict[str, str]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        header, body = _read_csv(content)
    elif suffix == ".xlsx":
        header, body = _read_xlsx(content)
    else:
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "El archivo debe ser .csv o .xlsx.",
        )
    return _as_records(header, body)


def parse_records(
    records: list[dict[str, str]],
    company_id: str,
    company_currency: str,
    existing_keys: set[tuple[str, str, str, str]],
) -> list[RowOutcome]:
    seen = set(existing_keys)
    outcomes: list[RowOutcome] = []
    for index, cells in enumerate(records):
        if all(not cells[column] for column in REQUIRED_COLUMNS):
            continue
        outcomes.append(
            _validate_row(
                row_number=index + 2,
                cells=cells,
                company_id=company_id,
                company_currency=company_currency,
                seen=seen,
            )
        )
    return outcomes


def row_to_json(row: RowOutcome) -> dict:
    return {
        "row": row.row,
        "period": row.period,
        "categoryRaw": row.category_raw,
        "category": row.category,
        "recordType": row.record_type,
        "currency": row.currency,
        "amountOriginal": original_str(row.amount) if row.amount is not None else None,
        "status": row.status,
    }


def _as_records(header: list[str], body: list[list[str]]) -> list[dict[str, str]]:
    cleaned = [cell.strip() for cell in header]
    if cleaned[: len(REQUIRED_COLUMNS)] != REQUIRED_COLUMNS:
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "El encabezado debe ser period,category,record_type,currency,amount.",
        )
    records = []
    for raw in body:
        values = list(raw) + [""] * len(REQUIRED_COLUMNS)
        records.append(
            {column: values[index].strip() for index, column in enumerate(REQUIRED_COLUMNS)}
        )
    return records


def _read_csv(content: bytes) -> tuple[list[str], list[list[str]]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise DomainError(400, "VALIDATION_ERROR", "El archivo CSV debe estar en UTF-8.") from exc
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise DomainError(400, "VALIDATION_ERROR", "El archivo no tiene encabezado.")
    return rows[0], rows[1:]


def _read_xlsx(content: bytes) -> tuple[list[str], list[list[str]]]:
    try:
        workbook = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except Exception as exc:
        raise DomainError(400, "VALIDATION_ERROR", "No se pudo leer el archivo Excel.") from exc
    sheet = workbook.active
    rows = [list(row) for row in sheet.iter_rows(values_only=True)]
    workbook.close()
    if not rows:
        raise DomainError(400, "VALIDATION_ERROR", "El archivo no tiene encabezado.")
    header = ["" if cell is None else str(cell).strip() for cell in rows[0]]
    body = [[_excel_cell(value) for value in raw] for raw in rows[1:]]
    return header, body


def _excel_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return format(Decimal(str(value)), "f")
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value).strip()


def _validate_row(
    row_number: int,
    cells: dict[str, str],
    company_id: str,
    company_currency: str,
    seen: set[tuple[str, str, str, str]],
) -> RowOutcome:
    period_raw = cells["period"]
    category_raw = cells["category"]
    record_raw = cells["record_type"]
    currency_raw = cells["currency"]
    amount_raw = cells["amount"]

    def rejected(field: str, message: str, **parsed: object) -> RowOutcome:
        return RowOutcome(
            row=row_number,
            category_raw=category_raw,
            status="REJECTED",
            period=parsed.get("period", period_raw or None),
            category=parsed.get("category"),
            record_type=parsed.get("record_type"),
            currency=parsed.get("currency"),
            amount=parsed.get("amount"),
            field=field,
            message=message,
        )

    if not period_raw:
        return rejected("period", "Falta el periodo.")
    if not PERIOD_RE.fullmatch(period_raw):
        return rejected("period", "El periodo debe tener formato YYYY-MM.")

    if not category_raw:
        return rejected("category", "Falta la categoría.", period=period_raw)
    category = resolve_category(category_raw)
    if category is None:
        return rejected("category", "La categoría no está en el catálogo.", period=period_raw)

    if not record_raw:
        return rejected(
            "record_type",
            "Falta el tipo de registro.",
            period=period_raw,
            category=category,
        )
    record_type = record_raw.upper()
    if record_type not in {"REVENUE", "EXPENSE"}:
        return rejected(
            "record_type",
            "El tipo de registro debe ser REVENUE o EXPENSE.",
            period=period_raw,
            category=category,
        )
    expected = CATALOG[category]
    if record_type != expected:
        return rejected(
            "record_type",
            f"La categoría {category} corresponde a {expected}.",
            period=period_raw,
            category=category,
            record_type=record_type,
        )

    if not currency_raw:
        return rejected(
            "currency",
            "Falta la moneda.",
            period=period_raw,
            category=category,
            record_type=record_type,
        )
    currency = currency_raw.upper()
    if currency != company_currency:
        return rejected(
            "currency",
            f"La moneda debe ser {company_currency}.",
            period=period_raw,
            category=category,
            record_type=record_type,
            currency=currency,
        )

    parsed = {
        "period": period_raw,
        "category": category,
        "record_type": record_type,
        "currency": currency,
    }
    if not amount_raw:
        return rejected("amount", "Falta el importe.", **parsed)
    if not AMOUNT_RE.fullmatch(amount_raw):
        return rejected("amount", "El importe debe ser mayor a cero.", **parsed)
    amount = Decimal(amount_raw)
    if amount <= 0:
        return rejected("amount", "El importe debe ser mayor a cero.", **parsed, amount=amount)

    key = (company_id, period_raw, category, record_type)
    if key in seen:
        return RowOutcome(
            row=row_number,
            category_raw=category_raw,
            status="DUPLICATE",
            amount=amount,
            **parsed,
        )
    seen.add(key)
    return RowOutcome(
        row=row_number,
        category_raw=category_raw,
        status="ACCEPTED",
        amount=amount,
        **parsed,
    )
