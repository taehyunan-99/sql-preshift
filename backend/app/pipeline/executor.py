"""트랜잭션 적용 + 롤백 스크립트 생성 + 감사로그 — ADR-009."""

from __future__ import annotations

import uuid
from typing import Optional

import sqlglot.expressions as exp
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from app.pipeline.validation import ValidationError, check_forbidden, parse
from app.schemas.analysis import AnalyzeResponse, ApplyResult, RollbackResult

import datetime

# ─── analyze token 캐시 (프로세스 내 메모리) ─────────────────────────
_token_cache: dict[str, AnalyzeResponse] = {}


def store_token(response: AnalyzeResponse) -> str:
    token = str(uuid.uuid4())
    _token_cache[token] = response
    return token


def consume_token(token: str) -> AnalyzeResponse:
    result = _token_cache.pop(token, None)
    if result is None:
        raise ValidationError(f"유효하지 않거나 만료된 토큰입니다: {token}")
    return result


# ─── build_down_script ───────────────────────────────────────────────

def build_down_script(ast: exp.Expression, before_tables: dict) -> str:
    """AST로부터 역연산 SQL을 생성한다."""
    parts: list[str] = []

    for create in ast.find_all(exp.Create):
        if str(create.args.get("kind", "")).upper() != "TABLE":
            continue
        schema_expr = create.find(exp.Schema)
        tbl = schema_expr.find(exp.Table) if schema_expr else create.find(exp.Table)
        if tbl:
            parts.append(f"DROP TABLE IF EXISTS {tbl.sql(dialect='postgres')};")

    for drop in ast.find_all(exp.Drop):
        if str(drop.args.get("kind", "")).upper() != "TABLE":
            continue
        tbl = drop.find(exp.Table)
        if tbl is None:
            continue
        tbl_name = tbl.name
        node = _find_table_node(before_tables, tbl_name)
        if node:
            col_defs = _columns_to_sql(node.columns)
            parts.append(f"CREATE TABLE IF NOT EXISTS {tbl.sql(dialect='postgres')} ({col_defs});")
        else:
            parts.append(f"-- ROLLBACK: CREATE TABLE {tbl.sql(dialect='postgres')} -- 원본 DDL 정보 없음")

    for alter in ast.find_all(exp.Alter):
        if str(alter.args.get("kind", "")).upper() != "TABLE":
            continue
        tbl = alter.find(exp.Table)
        if tbl is None:
            continue

        tbl_name = tbl.name
        node = _find_table_node(before_tables, tbl_name)
        col_map = {c.name: c for c in node.columns} if node else {}

        for action in alter.args.get("actions", []):
            # ADD COLUMN → DROP COLUMN
            if isinstance(action, exp.ColumnDef):
                col_name = action.name
                parts.append(
                    f"ALTER TABLE {tbl.sql(dialect='postgres')} DROP COLUMN {col_name};"
                )

            # DROP COLUMN → ADD COLUMN (before 타입 참조)
            elif isinstance(action, exp.Drop):
                col_kind = str(action.args.get("kind", "")).upper()
                if col_kind == "COLUMN":
                    col_ref = action.find(exp.Column)
                    if col_ref:
                        col_name = col_ref.name
                        before_col = col_map.get(col_name)
                        if before_col:
                            not_null = " NOT NULL" if not before_col.nullable and not before_col.pk else ""
                            parts.append(
                                f"ALTER TABLE {tbl.sql(dialect='postgres')} "
                                f"ADD COLUMN {col_name} {before_col.type}{not_null};"
                            )
                        else:
                            parts.append(
                                f"-- ROLLBACK: ALTER TABLE {tbl.sql(dialect='postgres')} "
                                f"ADD COLUMN {col_name} <원본 타입 정보 없음>"
                            )

            # ALTER COLUMN TYPE → 이전 타입으로 복구
            elif isinstance(action, exp.AlterColumn):
                col_ident = action.args.get("this")
                col_name = col_ident.name if col_ident else None
                if col_name:
                    before_col = col_map.get(col_name)
                    if before_col:
                        parts.append(
                            f"ALTER TABLE {tbl.sql(dialect='postgres')} "
                            f"ALTER COLUMN {col_name} TYPE {before_col.type};"
                        )

    return "\n".join(parts)


def _find_table_node(before_tables: dict, tbl_name: str):
    for tid, node in before_tables.items():
        if node.table == tbl_name or tid == tbl_name:
            return node
    return None


def _columns_to_sql(columns) -> str:
    parts = []
    for col in columns:
        constraints = []
        if col.pk:
            constraints.append("PRIMARY KEY")
        if not col.nullable and not col.pk:
            constraints.append("NOT NULL")
        constraint_str = " " + " ".join(constraints) if constraints else ""
        parts.append(f"{col.name} {col.type}{constraint_str}")
    return ", ".join(parts)


# ─── apply ───────────────────────────────────────────────────────────

def apply(
    sql: str,
    down_script: Optional[str],
    session: Session,
    target_engine: Optional[Engine] = None,
) -> ApplyResult:
    """SQL을 적용하고 MigrationHistory/AuditLog에 기록한다.

    보안 (fail-closed, 함수 직접호출 우회 방어):
    1. parse(sql) + check_forbidden(ast) — 금지 패턴 차단
    2. deterministic_rules(ast) — critical 위험 차단 (WHERE 없는 DELETE, DROP TABLE 등)
    """
    from app.models.audit import AuditLog, MigrationHistory
    from app.pipeline.risk import deterministic_rules

    # ① 재검증 — 검증 우회 방지
    ast = parse(sql)
    violations = check_forbidden(ast)
    if violations:
        raise ValidationError(f"금지 패턴 위반: {violations[0].message}")

    # ② critical 위험 차단 — API 레이어 우회 시에도 함수 레벨에서 차단
    critical_risks = [r for r in deterministic_rules(ast) if r.level == "critical"]
    if critical_risks:
        raise ValidationError(
            f"critical 위험 SQL은 적용할 수 없습니다: {critical_risks[0].rule}"
        )

    # ③ target 실행 후 메타 기록 — target 실패 시 메타 기록 없음(원자성 보장)
    engine = target_engine if target_engine is not None else session.get_bind()
    with engine.begin() as conn:
        conn.execute(text(sql))

    migration = MigrationHistory(sql=sql, down_script=down_script)
    session.add(migration)
    session.flush()

    audit = AuditLog(
        migration_id=migration.id,
        action="apply",
        detail=f"SQL 적용: {sql[:200]}",
    )
    session.add(audit)
    session.flush()

    applied_at = audit.created_at.isoformat() if audit.created_at else datetime.datetime.utcnow().isoformat()
    return ApplyResult(
        auditId=str(audit.id),
        appliedAt=applied_at,
        sql=sql,
    )


# ─── rollback ────────────────────────────────────────────────────────

def rollback(
    audit_id: int,
    session: Session,
    target_engine: Optional[Engine] = None,
) -> RollbackResult:
    """감사 로그 ID로 저장된 down 스크립트를 실행해 원복한다."""
    from app.models.audit import AuditLog, MigrationHistory

    audit = session.get(AuditLog, audit_id)
    if audit is None:
        raise ValidationError(f"감사 로그 ID {audit_id}를 찾을 수 없습니다.")

    migration = session.get(MigrationHistory, audit.migration_id)
    if migration is None or not migration.down_script:
        raise ValidationError(f"롤백 스크립트가 없습니다. (migration_id={audit.migration_id})")

    down_sql = migration.down_script

    # down_script 각 구문을 parse+check_forbidden으로 검증 후 실행 (fail-closed)
    stmts = [s.strip() for s in down_sql.split(";") if s.strip() and not s.strip().startswith("--")]
    for stmt in stmts:
        stmt_ast = parse(stmt)
        stmt_violations = check_forbidden(stmt_ast)
        if stmt_violations:
            raise ValidationError(
                f"롤백 스크립트 금지 패턴 위반: {stmt_violations[0].message} (stmt: {stmt[:80]})"
            )

    engine = target_engine if target_engine is not None else session.get_bind()
    with engine.begin() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))

    rollback_audit = AuditLog(
        migration_id=migration.id,
        action="rollback",
        detail=f"롤백 적용: {down_sql[:200]}",
    )
    session.add(rollback_audit)
    session.flush()

    rolled_back_at = rollback_audit.created_at.isoformat() if rollback_audit.created_at else datetime.datetime.utcnow().isoformat()
    return RollbackResult(
        auditId=str(audit_id),
        rolledBackAt=rolled_back_at,
    )
