import sqlite3
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from app.db.database import get_conn
from app.db.repository import list_lines
from app.engine.catalog import PERIOD_RE
from app.engine.consolidation import consolidate
from app.engine.types import Adjustment
from app.engine.workflow import (
    create_company,
    create_scenario,
    import_upload,
    list_companies,
    read_results,
    simulate_scenario,
)
from app.errors import DomainError
from app.schemas.common import ErrorResponse
from app.schemas.finance import (
    Company,
    CompanyCreate,
    CompanyList,
    Consolidation,
    ImportResult,
    ScenarioCreate,
    ScenarioCreated,
    ScenarioResults,
)

router = APIRouter()

ERRORS = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}


@router.get("/health", tags=["Sistema"])
def health() -> dict:
    return {"status": "ok", "service": "scenariolab-api"}


@router.get("/companies", response_model=CompanyList, tags=["Empresas"])
def get_companies(connection: sqlite3.Connection = Depends(get_conn)) -> dict:
    return list_companies(connection)


@router.post("/companies", response_model=Company, status_code=201, responses=ERRORS, tags=["Empresas"])
def post_company(body: CompanyCreate, connection: sqlite3.Connection = Depends(get_conn)) -> dict:
    return create_company(connection, body.name, body.country, body.currency)


@router.post("/imports", response_model=ImportResult, responses=ERRORS, tags=["Importación"])
def post_import(
    companyId: str = Form(...),
    file: UploadFile = File(...),
    dry_run: bool = Query(False),
    connection: sqlite3.Connection = Depends(get_conn),
) -> dict:
    content = file.file.read()
    return import_upload(
        connection,
        company_id=companyId,
        filename=file.filename or "",
        content=content,
        dry_run=dry_run,
    )


@router.get("/consolidation", response_model=Consolidation, responses=ERRORS, tags=["Consolidación"])
def get_consolidation(
    period: str | None = Query(None),
    connection: sqlite3.Connection = Depends(get_conn),
) -> dict:
    if period is not None and not PERIOD_RE.fullmatch(period):
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "El periodo debe tener formato YYYY-MM.",
            [{"field": "period", "message": "El periodo debe tener formato YYYY-MM."}],
        )
    return consolidate(list_lines(connection), period)


@router.post("/scenarios", response_model=ScenarioCreated, status_code=201, responses=ERRORS, tags=["Escenarios"])
def post_scenario(body: ScenarioCreate, connection: sqlite3.Connection = Depends(get_conn)) -> dict:
    return create_scenario(connection, body.name, [_to_adjustment(item) for item in body.adjustments])


@router.post(
    "/scenarios/{scenario_id}/simulate",
    response_model=ScenarioResults,
    responses=ERRORS,
    tags=["Escenarios"],
)
def post_simulate(scenario_id: str, connection: sqlite3.Connection = Depends(get_conn)) -> dict:
    return simulate_scenario(connection, scenario_id)


@router.get(
    "/scenarios/{scenario_id}/results",
    response_model=ScenarioResults,
    responses=ERRORS,
    tags=["Escenarios"],
)
def get_scenario_results(scenario_id: str, connection: sqlite3.Connection = Depends(get_conn)) -> dict:
    return read_results(connection, scenario_id)


def _to_adjustment(item) -> Adjustment:
    company_id = item.companyId.strip() if isinstance(item.companyId, str) else None
    if company_id == "":
        company_id = None
    currency = None
    if item.type == "EXCHANGE_RATE" and isinstance(item.currency, str) and item.currency.strip():
        currency = item.currency.strip().upper()
    if item.type not in {"EXCHANGE_RATE", "REVENUE", "OPERATING_COST"}:
        raise DomainError(
            400,
            "VALIDATION_ERROR",
            "El tipo de ajuste debe ser EXCHANGE_RATE, REVENUE u OPERATING_COST.",
            [{"field": "type", "message": "Tipo de ajuste no reconocido."}],
        )
    return Adjustment(
        type=item.type,
        percentage=Decimal(str(item.percentage)),
        currency=currency,
        company_id=company_id,
    )
