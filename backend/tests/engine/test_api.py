import io

import pytest
from openpyxl import Workbook

from app.seed import DEMO_COMPANIES, seed

HEADER = "period,category,record_type,currency,amount\n"
JANUARY = {
    "company-gt": HEADER + "2026-01,Ventas,REVENUE,GTQ,77500\n2026-01,Costos operativos,EXPENSE,GTQ,38750\n",
    "company-us": HEADER + "2026-01,SALES,REVENUE,USD,8000\n2026-01,OPERATING_COST,EXPENSE,USD,3000\n",
    "company-mx": HEADER + "2026-01,SALES,REVENUE,MXN,180000\n2026-01,OPERATING_COST,EXPENSE,MXN,90000\n",
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    from app.db.database import connect, init_db
    from app.db.repository import insert_company
    from app.main import create_app
    from fastapi.testclient import TestClient

    init_db()
    connection = connect()
    try:
        for company in DEMO_COMPANIES:
            insert_company(connection, *company)
        connection.commit()
    finally:
        connection.close()

    with TestClient(create_app()) as test_client:
        yield test_client


def upload(client, company_id, csv_text, filename="datos.csv", dry_run=False):
    params = {"dry_run": "true"} if dry_run else {}
    return client.post(
        "/api/imports",
        params=params,
        data={"companyId": company_id},
        files={"file": (filename, csv_text.encode("utf-8"), "text/csv")},
    )


def test_health_and_companies(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "service": "scenariolab-api"}
    companies = client.get("/api/companies").json()["companies"]
    assert [company["id"] for company in companies] == ["company-gt", "company-us", "company-mx"]
    assert companies[0]["currency"] == "GTQ"


def test_create_company_rejects_unknown_currency(client):
    rejected = client.post(
        "/api/companies",
        json={"name": "Empresa D", "country": "España", "currency": "EUR"},
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"]["code"] == "VALIDATION_ERROR"
    created = client.post(
        "/api/companies",
        json={"name": "Empresa D", "country": "Guatemala", "currency": "gtq"},
    )
    assert created.status_code == 201
    assert created.json()["currency"] == "GTQ"


def test_dry_run_does_not_write_and_duplicates_are_skipped(client):
    preview = upload(client, "company-gt", JANUARY["company-gt"], dry_run=True)
    assert preview.status_code == 200
    body = preview.json()
    assert body["dryRun"] is True
    assert body["accepted"] == 2
    assert client.get("/api/consolidation").json()["lines"] == []

    saved = upload(client, "company-gt", JANUARY["company-gt"])
    assert saved.json()["accepted"] == 2
    again = upload(client, "company-gt", JANUARY["company-gt"])
    assert again.json()["accepted"] == 0
    assert again.json()["duplicates"] == 2
    assert len(client.get("/api/consolidation").json()["lines"]) == 2

    repeated = HEADER + "2026-02,Ventas,REVENUE,GTQ,100\n2026-02,sales,REVENUE,GTQ,200\n"
    within = upload(client, "company-gt", repeated)
    assert [row["status"] for row in within.json()["rows"]] == ["ACCEPTED", "DUPLICATE"]


def test_invalid_rows_stay_out_of_the_consolidation(client):
    csv_text = (
        HEADER
        + "2026-01,Ventas,REVENUE,GTQ,77500\n"
        + "2026-01,Marketing,EXPENSE,GTQ,10\n"
        + "2026-01,SALES,EXPENSE,GTQ,10\n"
        + "2026-13,Ventas,REVENUE,GTQ,10\n"
        + "2026-01,Ventas,REVENUE,USD,10\n"
        + "2026-01,gastos,EXPENSE,GTQ,0\n"
        + "2026-01,renta,EXPENSE,GTQ,-5\n"
    )
    response = upload(client, "company-gt", csv_text)
    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] == 1
    assert body["rejected"] == 6
    assert body["errors"][0]["row"] == 3
    totals = client.get("/api/consolidation").json()["totals"]
    assert totals["revenue"] == "10000.00"
    assert totals["expense"] == "0.00"


def test_bad_file_and_missing_company(client):
    missing = upload(client, "company-no", JANUARY["company-gt"])
    assert missing.status_code == 404
    wrong = upload(client, "company-gt", JANUARY["company-gt"], filename="datos.txt")
    assert wrong.status_code == 400
    header = upload(client, "company-gt", "fecha,monto\n2026-01,10\n")
    assert header.status_code == 400
    assert "encabezado" in header.json()["error"]["message"]


def test_xlsx_uses_the_same_rules(client):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["period", "category", "record_type", "currency", "amount"])
    sheet.append(["2026-01", "Ventas", "REVENUE", "GTQ", 77500])
    buffer = io.BytesIO()
    workbook.save(buffer)
    response = client.post(
        "/api/imports",
        data={"companyId": "company-gt"},
        files={"file": ("empresa.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200
    assert response.json()["accepted"] == 1
    assert client.get("/api/consolidation").json()["totals"]["revenue"] == "10000.00"


def test_r1_through_the_api_keeps_originals(client):
    for company_id, csv_text in JANUARY.items():
        response = upload(client, company_id, csv_text)
        assert response.status_code == 200
        assert response.json()["rejected"] == 0

    base = client.get("/api/consolidation", params={"period": "2026-01"})
    assert base.json()["totals"]["operatingResult"] == "15000.00"

    created = client.post(
        "/api/scenarios",
        json={
            "name": "Crisis Guatemala",
            "adjustments": [
                {"type": "EXCHANGE_RATE", "currency": "gtq", "percentage": 10},
                {"type": "OPERATING_COST", "companyId": "company-gt", "percentage": 8},
            ],
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["adjustments"][0]["currency"] == "GTQ"
    assert body["adjustments"][0]["percentage"] == 10
    scenario_id = body["id"]

    missing = client.get(f"/api/scenarios/{scenario_id}/results")
    assert missing.status_code == 404

    simulated = client.post(f"/api/scenarios/{scenario_id}/simulate")
    assert simulated.status_code == 200
    results = simulated.json()
    assert results["simulated"]["operatingResult"] == "14181.82"
    assert results["variance"]["operatingResult"]["percentage"] == "-5.45"
    assert results["fxRates"]["simulated"][0]["unitsPerUsd"] == "8.5250"
    stored = client.get(f"/api/scenarios/{scenario_id}/results")
    assert stored.json() == results

    reread = client.get("/api/consolidation", params={"period": "2026-01"})
    assert reread.json()["totals"] == base.json()["totals"]
    assert reread.json()["lines"] == base.json()["lines"]

    duplicate = client.post(
        "/api/scenarios",
        json={"name": "Crisis Guatemala", "adjustments": []},
    )
    assert duplicate.status_code == 409

    overlap = client.post(
        "/api/scenarios",
        json={
            "name": "Solape",
            "adjustments": [
                {"type": "REVENUE", "percentage": 10},
                {"type": "REVENUE", "companyId": "company-gt", "percentage": 5},
            ],
        },
    )
    assert overlap.status_code == 409

    negative = client.post(
        "/api/scenarios",
        json={
            "name": "Importe negativo",
            "adjustments": [{"type": "OPERATING_COST", "percentage": -91}],
        },
    )
    assert negative.status_code == 400

    invalid_rate = client.post(
        "/api/scenarios",
        json={
            "name": "Tasa inválida",
            "adjustments": [{"type": "EXCHANGE_RATE", "currency": "GTQ", "percentage": -99}],
        },
    )
    assert invalid_rate.status_code == 400


def test_demo_seed_matches_january_r1_and_three_month_total(client):
    first = seed()
    assert sum(item["rejected"] for item in first) == 0
    assert sum(item["accepted"] for item in first) == 18
    january = client.get("/api/consolidation", params={"period": "2026-01"}).json()
    assert january["totals"] == {
        "revenue": "28000.00",
        "expense": "13000.00",
        "operatingResult": "15000.00",
    }
    all_months = client.get("/api/consolidation").json()
    assert all_months["totals"] == {
        "revenue": "93000.00",
        "expense": "43500.00",
        "operatingResult": "49500.00",
    }
    assert [point["period"] for point in all_months["series"]] == ["2026-01", "2026-02", "2026-03"]
    second = seed()
    assert sum(item["accepted"] for item in second) == 0
    assert client.get("/api/consolidation").json()["totals"]["operatingResult"] == "49500.00"
