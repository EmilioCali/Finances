import secrets
from datetime import datetime, timezone


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
