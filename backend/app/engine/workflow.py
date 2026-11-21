import re
import sqlite3
from decimal import Decimal
from pathlib import Path

from app.db import repository
from app.engine.aggregate import company_sort
from app.engine.catalog import fold
from app.engine.fx import BASE_RATES
from app.engine.imports import load_table, parse_records, row_to_json
from app.engine.simulation import build_results, validate_adjustments
from app.engine.types import Adjustment
from app.errors import DomainError
from app.ids import new_id, utc_now


def list_companies(connection: sqlite3.Connection) -> dict:
    companies = repository.list_companies(connection)
    companies.sort(key=lambda company: company_sort(company["id"]))
    return {"companies": companies}


def create_company(
    connection: sqlite3.Connection,
    name: str,
    country: str,
    currency: str,
) -> dict:
    cleaned_name = name.strip()
    cleaned_country = country.strip()
    cleaned_currency = currency.strip().upper()
    if not cleaned_name or not cleaned_country:
        raise DomainError(400, "VALIDATION_ERROR", "El nombre y el país son obligatorios.")
    if cleaned_currency not in BASE_RATES:
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "La moneda solo puede ser GTQ, USD o MXN.",
            [{"field": "currency", "message": "La moneda solo puede ser GTQ, USD o MXN."}],
        )
    company_id = _unique_company_id(connection, cleaned_name)
    repository.insert_company(
        connection,
        company_id,
        cleaned_name,
        cleaned_country,
        cleaned_currency,
    )
    connection.commit()
    return {
        "id": company_id,
        "name": cleaned_name,
        "country": cleaned_country,
        "currency": cleaned_currency,
    }


def import_upload(
    connection: sqlite3.Connection,
    company_id: str,
    filename: str,
    content: bytes,
    dry_run: bool,
) -> dict:
    company_id = company_id.strip()
    company = repository.get_company(connection, company_id)
    if company is None:
        raise DomainError(404, "NOT_FOUND", "No se encontró la empresa.")
    safe_name = Path(filename).name
    if not safe_name:
        raise DomainError(400, "VALIDATION_ERROR", "El archivo es obligatorio.")
    frame = load_table(safe_name, content)
    outcomes = parse_records(
        frame,
        company_id,
        company["currency"],
        repository.existing_keys(connection),
    )
    import_id = new_id("imp")
    if not dry_run:
        _persist_import(connection, import_id, company_id, safe_name, outcomes)
    return _import_payload(import_id, company_id, safe_name, dry_run, outcomes)


def create_scenario(
    connection: sqlite3.Connection,
    name: str,
    adjustments: list[Adjustment],
) -> dict:
    cleaned = name.strip()
    if not cleaned:
        raise DomainError(400, "VALIDATION_ERROR", "El escenario necesita un nombre.")
    company_ids = {company["id"] for company in repository.list_companies(connection)}
    validate_adjustments(adjustments, company_ids)
    if repository.get_scenario_by_name(connection, cleaned) is not None:
        raise DomainError(409, "CONFLICT", "Ya existe un escenario con ese nombre.")
    scenario_id = new_id("scn")
    created_at = utc_now()
    payload = [adjustment.as_json() for adjustment in adjustments]
    try:
        repository.insert_scenario(connection, scenario_id, cleaned, payload, created_at)
        connection.commit()
    except sqlite3.IntegrityError as exc:
        connection.rollback()
        raise DomainError(409, "CONFLICT", "Ya existe un escenario con ese nombre.") from exc
    return {
        "id": scenario_id,
        "name": cleaned,
        "adjustments": payload,
        "createdAt": created_at,
    }


def simulate_scenario(connection: sqlite3.Connection, scenario_id: str) -> dict:
    scenario = repository.get_scenario(connection, scenario_id)
    if scenario is None:
        raise DomainError(404, "NOT_FOUND", "No se encontró el escenario.")
    adjustments = [_adjustment_from_json(item) for item in scenario["adjustments"]]
    results = build_results(
        lines=repository.list_lines(connection),
        adjustments=adjustments,
        scenario_id=scenario["id"],
        name=scenario["name"],
    )
    repository.save_results(connection, scenario_id, results, utc_now())
    connection.commit()
    return results


def read_results(connection: sqlite3.Connection, scenario_id: str) -> dict:
    if repository.get_scenario(connection, scenario_id) is None:
        raise DomainError(404, "NOT_FOUND", "No se encontró el escenario.")
    stored = repository.get_results(connection, scenario_id)
    if stored is None:
        raise DomainError(404, "NOT_FOUND", "El escenario todavía no se ha simulado.")
    return stored


def _persist_import(connection, import_id, company_id, filename, outcomes) -> None:
    try:
        repository.insert_batch(connection, import_id, company_id, filename, utc_now())
        for outcome in outcomes:
            if outcome.status != "ACCEPTED":
                continue
            repository.insert_line(
                connection,
                new_id("line"),
                company_id,
                outcome.period,
                outcome.category_raw,
                outcome.category,
                outcome.record_type,
                outcome.currency,
                outcome.amount,
                filename,
                outcome.row,
                import_id,
            )
        connection.commit()
    except sqlite3.IntegrityError as exc:
        connection.rollback()
        raise DomainError(
            409,
            "CONFLICT",
            "La importación chocó con filas ya guardadas.",
        ) from exc
    except Exception:
        connection.rollback()
        raise


def _import_payload(import_id, company_id, filename, dry_run, outcomes) -> dict:
    return {
        "importId": import_id,
        "companyId": company_id,
        "fileName": filename,
        "dryRun": dry_run,
        "accepted": sum(row.status == "ACCEPTED" for row in outcomes),
        "rejected": sum(row.status == "REJECTED" for row in outcomes),
        "duplicates": sum(row.status == "DUPLICATE" for row in outcomes),
        "rows": [row_to_json(row) for row in outcomes],
        "errors": [
            {"row": row.row, "field": row.field, "message": row.message}
            for row in outcomes
            if row.status == "REJECTED"
        ],
    }


def _adjustment_from_json(data: dict) -> Adjustment:
    return Adjustment(
        type=data["type"],
        percentage=Decimal(str(data["percentage"])),
        currency=data.get("currency"),
        company_id=data.get("companyId"),
    )


def _unique_company_id(connection: sqlite3.Connection, name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", fold(name)).strip("-") or "empresa"
    candidate = f"company-{slug}"
    if repository.get_company(connection, candidate) is None:
        return candidate
    return f"{candidate}-{new_id('x').split('_', 1)[1]}"
