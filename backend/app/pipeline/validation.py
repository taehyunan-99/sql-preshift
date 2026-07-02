"""SQL 파싱 + 금지패턴 하드차단 — ADR-005/006."""

from __future__ import annotations

import sqlglot
import sqlglot.expressions as exp

from app.schemas.analysis import Violation

_SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "pg_toast"}

# 화이트리스트(C1) — 이 도구가 실제 다루는 DML + 스키마 마이그레이션 DDL 노드만 허용한다.
# 여기 없는 최상위 노드는 전부 거부한다. sqlglot이 미지원 구문을 엉뚱한 노드로 폴백하기 때문에
# (DO/VACUUM FULL/REINDEX -> Command, COPY -> Copy, CLUSTER -> Alias, CHECKPOINT -> Column,
#  GRANT/REVOKE 등) 블랙리스트로는 사각지대를 다 못 막아 화이트리스트로 뒤집는다.
_ALLOWED_STATEMENTS = (
    exp.Select, exp.Insert, exp.Update, exp.Delete,   # DML
    exp.Create, exp.Alter, exp.Drop, exp.TruncateTable,  # 마이그레이션 DDL
)


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

    # 화이트리스트 fail-closed(C1) — _ALLOWED_STATEMENTS에 없는 최상위 노드는 거부한다.
    # sqlglot 폴백 노드(Command/Copy/Alias/Column 등)와 마이그레이션 범위 밖 구문(GRANT/REVOKE 등)을
    # 한 번에 차단해 risk.py가 못 보는 사각지대로 위험 SQL이 새는 것을 막는다.
    stmt = stmts[0]
    if not isinstance(stmt, _ALLOWED_STATEMENTS):
        raise ValidationError(
            "Unsupported or unrecognized SQL statement — only standard single-statement DML/DDL is allowed."
        )

    return stmt


def check_forbidden(ast: sqlglot.Expression) -> list[Violation]:
    """하드 차단 패턴 검사. 위반 시 Violation 목록 반환."""
    violations: list[Violation] = []

    # 멀티 스테이트먼트는 parse() 단계에서 이미 ValidationError로 차단됨

    # 2. 시스템 스키마 접근 + non-public 스키마 수식자 차단
    # 데모 범위는 public 전용 — build_graph가 public만 reflection하므로 non-public 대상은
    # diff가 비어 보이는데 Apply All은 그대로 실행돼 "미리보기" 계약이 깨진다. 명시적으로 거부한다.
    for table in ast.find_all(exp.Table):
        schema_name = table.args.get("db")
        if not schema_name:
            continue
        # Identifier.name는 따옴표를 벗긴 순수 스키마명 반환 — str()은 따옴표까지 포함해
        # "public" 같은 인용 식별자가 non-public으로 오탐되므로 .name을 쓴다.
        schema_lower = schema_name.name.lower()
        if schema_lower in _SYSTEM_SCHEMAS:
            violations.append(
                Violation(
                    rule="SYSTEM_SCHEMA",
                    # UI 노출 문자열은 영어(주석은 한국어)
                    message=f"Access to system schema '{schema_name}' is not allowed.",
                )
            )
            break
        if schema_lower != "public":
            violations.append(
                Violation(
                    rule="NON_PUBLIC_SCHEMA",
                    # UI 노출 문자열은 영어(주석은 한국어)
                    message="Only the 'public' schema is supported; schema-qualified targets outside public are not allowed.",
                )
            )
            break

    return violations
