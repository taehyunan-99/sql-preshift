"""자연어 / SQL 판별 — ADR-007."""

from __future__ import annotations

import sqlglot

from app.schemas.analysis import InputMode

_SQL_KEYWORDS = {
    "select", "insert", "update", "delete", "create", "alter", "drop",
    "truncate", "merge", "with", "explain", "vacuum", "analyze",
}


def classify_input(text: str) -> tuple[InputMode, float]:
    """sqlglot 파싱 성공 + 첫 토큰이 SQL 키워드이면 SQL(1.0), 아니면 NL(0.9)."""
    stripped = text.strip()
    if not stripped:
        return InputMode.NL, 0.9

    first_token = stripped.split()[0].lower().rstrip(";")
    if first_token not in _SQL_KEYWORDS:
        return InputMode.NL, 0.9

    try:
        result = sqlglot.parse(stripped, dialect="postgres")
        if result and result[0] is not None:
            return InputMode.SQL, 1.0
    except Exception:
        pass

    return InputMode.NL, 0.9
