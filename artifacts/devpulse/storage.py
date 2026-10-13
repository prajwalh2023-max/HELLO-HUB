"""Small SQLite-backed store for imported or clearly labeled demo activity."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd

from demo_data import TABLE_NAMES, build_demo_tables


DB_PATH = Path(__file__).parent / "data" / "devpulse.sqlite"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _json_default(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows = frame.to_dict(orient="records")
    for row in rows:
        for key, value in row.items():
            if value is None:
                continue
            if not isinstance(value, (list, dict, tuple)) and pd.isna(value):
                row[key] = None
    return rows


def save_tables(tables: dict[str, pd.DataFrame], source: str) -> None:
    """Replace the stored snapshot atomically, retaining original list fields."""
    with _connect() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        for name in TABLE_NAMES:
            connection.execute(
                f'CREATE TABLE IF NOT EXISTS "{name}" (row_id TEXT PRIMARY KEY, payload TEXT NOT NULL)'
            )

        connection.execute("BEGIN")
        for name in TABLE_NAMES:
            connection.execute(f'DELETE FROM "{name}"')
            frame = tables.get(name, pd.DataFrame())
            rows = _records(frame)
            for index, row in enumerate(rows):
                row_id = str(row.get("id", f"{name}-{index}"))
                payload = json.dumps(row, default=_json_default, ensure_ascii=False)
                connection.execute(
                    f'INSERT INTO "{name}" (row_id, payload) VALUES (?, ?)',
                    (row_id, payload),
                )
        connection.execute(
            "INSERT INTO app_metadata(key, value) VALUES('source', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (source,),
        )


def load_tables() -> tuple[dict[str, pd.DataFrame], str]:
    with _connect() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        exists = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='pull_requests'"
        ).fetchone()
        if not exists:
            demo = build_demo_tables()
            save_tables(demo, "demo")

        tables: dict[str, pd.DataFrame] = {}
        for name in TABLE_NAMES:
            rows = connection.execute(f'SELECT payload FROM "{name}" ORDER BY row_id').fetchall()
            tables[name] = pd.DataFrame([json.loads(row["payload"]) for row in rows])
        metadata = connection.execute(
            "SELECT value FROM app_metadata WHERE key='source'"
        ).fetchone()
        source = metadata["value"] if metadata else "demo"
        return tables, source


def validate_payload(payload: Any) -> dict[str, pd.DataFrame]:
    """Validate the documented JSON interchange format before replacing storage."""
    if not isinstance(payload, dict):
        raise ValueError("The JSON root must be an object with named datasets.")
    required = set(TABLE_NAMES)
    missing = sorted(required.difference(payload))
    if missing:
        raise ValueError(f"Missing datasets: {', '.join(missing)}")
    required_columns = {
        "pull_requests": {"id", "repository", "author", "state", "created_at", "updated_at", "merged_at", "first_review_at", "review_cycles", "changed_files", "reviewers"},
        "issues": {"id", "repository", "state", "assignee", "created_at", "updated_at", "participants"},
        "tasks": {"id", "repository", "assignee", "created_at", "due_at", "completed_at"},
        "sessions": {"id", "developer", "started_at", "focused"},
        "disruptions": {"id", "developer", "occurred_at", "recovered_productively"},
    }
    tables: dict[str, pd.DataFrame] = {}
    for name in TABLE_NAMES:
        rows = payload[name]
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError(f"'{name}' must be a list of JSON objects.")
        tables[name] = pd.DataFrame(rows)
        if rows:
            absent = sorted(required_columns[name].difference(tables[name].columns))
            if absent:
                raise ValueError(f"'{name}' is missing fields: {', '.join(absent)}.")
    if tables["pull_requests"].empty and tables["issues"].empty:
        raise ValueError("Include at least one pull request or issue record.")
    return tables


def export_payload(tables: dict[str, pd.DataFrame]) -> bytes:
    payload = {
        name: _records(tables.get(name, pd.DataFrame()))
        for name in TABLE_NAMES
    }
    return json.dumps(payload, default=_json_default, ensure_ascii=False, indent=2).encode("utf-8")
