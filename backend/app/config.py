import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")


def database_path() -> Path:
    configured = os.environ.get("DATABASE_PATH", "data/scenariolab.db")
    path = Path(configured)
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    return path
