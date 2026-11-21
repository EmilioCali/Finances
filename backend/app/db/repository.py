import json
import sqlite3
from decimal import Decimal

from app.engine.types import Line


def list_companies(connection: sqlite3.Connection) -> list[dict]:
    rows = connection.execute(
        "SELECT id, name, country, currency FROM companies ORDER BY id"
    ).fetchall()
    return [_company(row) for row in rows]


def get_company(connection: sqlite3.Connection, company_id: str) -> dict | None:
    row = connection.execute(
        "SELECT id, name, country, currency FROM companies WHERE id = ?",
        (company_id,),
    ).fetchone()
    if row is None:
        return None
    return _company(row)


def insert_company(
    connection: sqlite3.Connection,
    company_id: str,
    name: str,
    country: str,
    currency: str,
) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO companies (id, name, country, currency)
        VALUES (?, ?, ?, ?)
        """,
        (company_id, name, country, currency),
    )


def existing_keys(connection: sqlite3.Connection) -> set[tuple[str, str, str, str]]:
    rows = connection.execute(
        "SELECT company_id, period, category, record_type FROM financial_lines"
    ).fetchall()
    return {(row["company_id"], row["period"], row["category"], row["record_type"]) for row in rows}


def insert_batch(
    connection: sqlite3.Connection,
    import_id: str,
    company_id: str,
    file_name: str,
    created_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO import_batches (id, company_id, file_name, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (import_id, company_id, file_name, created_at),
    )


def insert_line(
    connection: sqlite3.Connection,
    line_id: str,
    company_id: str,
    period: str,
    category_raw: str,
    category: str,
    record_type: str,
    currency: str,
    amount_original: Decimal,
    source_file: str,
    source_row: int,
    import_id: str,
) -> None:
    connection.execute(
        """
        INSERT INTO financial_lines (
            id, company_id, period, category_raw, category, record_type,
            currency, amount_original, source_file, source_row, import_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            line_id,
            company_id,
            period,
            category_raw,
            category,
            record_type,
            currency,
            format(amount_original, "f"),
            source_file,
            source_row,
            import_id,
        ),
    )


def list_lines(connection: sqlite3.Connection) -> list[Line]:
    rows = connection.execute(
        """
        SELECT id, company_id, period, category_raw, category, record_type,
               currency, amount_original, source_file, source_row
        FROM financial_lines
        ORDER BY period, company_id, source_row, id
        """
    ).fetchall()
    return [
        Line(
            id=row["id"],
            company_id=row["company_id"],
            period=row["period"],
            category_raw=row["category_raw"],
            category=row["category"],
            record_type=row["record_type"],
            currency=row["currency"],
            amount_original=Decimal(row["amount_original"]),
            source_file=row["source_file"],
            source_row=row["source_row"],
        )
        for row in rows
    ]


def get_scenario_by_name(connection: sqlite3.Connection, name: str) -> dict | None:
    row = connection.execute(
        "SELECT id, name, adjustments_json, created_at FROM scenarios WHERE name = ?",
        (name,),
    ).fetchone()
    return _scenario(row) if row else None


def get_scenario(connection: sqlite3.Connection, scenario_id: str) -> dict | None:
    row = connection.execute(
        "SELECT id, name, adjustments_json, created_at FROM scenarios WHERE id = ?",
        (scenario_id,),
    ).fetchone()
    return _scenario(row) if row else None


def insert_scenario(
    connection: sqlite3.Connection,
    scenario_id: str,
    name: str,
    adjustments: list[dict],
    created_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO scenarios (id, name, adjustments_json, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (scenario_id, name, json.dumps(adjustments, ensure_ascii=False), created_at),
    )


def save_results(
    connection: sqlite3.Connection,
    scenario_id: str,
    results: dict,
    created_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO scenario_results (scenario_id, results_json, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(scenario_id) DO UPDATE SET
            results_json = excluded.results_json,
            created_at = excluded.created_at
        """,
        (scenario_id, json.dumps(results, ensure_ascii=False), created_at),
    )


def get_results(connection: sqlite3.Connection, scenario_id: str) -> dict | None:
    row = connection.execute(
        "SELECT results_json FROM scenario_results WHERE scenario_id = ?",
        (scenario_id,),
    ).fetchone()
    if row is None:
        return None
    return json.loads(row["results_json"])


def _company(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "country": row["country"],
        "currency": row["currency"],
    }


def _scenario(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "adjustments": json.loads(row["adjustments_json"]),
        "createdAt": row["created_at"],
    }
