from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.finance import router as finance_router
from app.db.database import init_db
from app.errors import DomainError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="ScenarioLab API",
        summary="Consolidación financiera y simulación de escenarios.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(finance_router, prefix="/api")
    # TKT-003 monta aquí el router del agente, en este mismo proceso.
    app.add_exception_handler(DomainError, _domain_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    return app


async def _domain_error(_request: Request, exc: DomainError) -> JSONResponse:
    details = []
    for item in exc.details:
        detail = {"message": item["message"]}
        if item.get("field"):
            detail["field"] = item["field"]
        if item.get("row") is not None:
            detail["row"] = item["row"]
        details.append(detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": details}},
    )


async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", []) if part not in {"body", "query", "form"}]
        details.append(
            {
                "field": ".".join(location) or "body",
                "message": error.get("msg", "Valor inválido."),
            }
        )
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "La solicitud no es válida.",
                "details": details,
            }
        },
    )


app = create_app()
