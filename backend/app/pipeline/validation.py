"""SQL 파싱 + 금지패턴 하드차단 — ADR-005/006."""

from __future__ import annotations

import sqlglot
import sqlglot.expressions as exp

from app.schemas.analysis import Violation

_SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "pg_toast"}


class ValidationError(Exception):
    """sqlglot 파싱 실패 시 발생."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def parse(sql: str) -> sqlglot.Expression:
    """postgres 방언으로 파싱. 멀티 스테이트먼트이거나 파싱 실패 시 ValidationError."""
    try:
        result = sqlglot.parse(sql.strip(), dialect="postgres", error_level=sqlglot.ErrorLevel.RAISE)
    except sqlglot.errors.ParseError as e:
        raise ValidationError(str(e)) from e

    stmts = [s for s in result if s is not None]
    if not stmts:
        # UI 노출 문자열은 영어(주석은 한국어) — 빈 입력/파싱 결과 없음
        raise ValidationError("Empty SQL or nothing to parse.")
    if len(stmts) > 1:
        raise ValidationError("Multiple statements are not allowed.")

    return stmts[0]


def check_forbidden(ast: sqlglot.Expression) -> list[Violation]:
    """하드 차단 패턴 검사. 위반 시 Violation 목록 반환."""
    violations: list[Violation] = []

    # 멀티 스테이트먼트는 parse() 단계에서 이미 ValidationError로 차단됨

    # 2. 시스템 스키마 접근
    for table in ast.find_all(exp.Table):
        schema_name = table.args.get("db")
        if schema_name and str(schema_name).lower() in _SYSTEM_SCHEMAS:
            violations.append(
                Violation(
                    rule="SYSTEM_SCHEMA",
                    # UI 노출 문자열은 영어(주석은 한국어)
                    message=f"Access to system schema '{schema_name}' is not allowed.",
                )
            )
            break

    return violations
