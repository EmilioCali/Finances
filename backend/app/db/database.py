import sqlite3
from collections.abc import Iterator

from app.config import database_path

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    currency TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE IF NOT EXISTS financial_lines (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    period TEXT NOT NULL,
    category_raw TEXT NOT NULL,
    category TEXT NOT NULL,
    record_type TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount_original TEXT NOT NULL,
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    import_id TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies (id),
    FOREIGN KEY (import_id) REFERENCES import_batches (id),
    UNIQUE (company_id, period, category, record_type)
);

CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    adjustments_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenario_results (
    scenario_id TEXT PRIMARY KEY,
    results_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (scenario_id) REFERENCES scenarios (id)
);
"""


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    connection = connect()
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def get_conn() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        yield connection
    finally:
        connection.close()
