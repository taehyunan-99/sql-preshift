"""트랜잭션 적용 + 롤백 스크립트 생성 + 감사로그 — ADR-009."""

from __future__ import annotations

import uuid
from collections import OrderedDict
from typing import Optional

import sqlglot.expressions as exp
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from app.pipeline.validation import ValidationError, check_forbidden, parse
from app.schemas.analysis import AnalyzeResponse, ApplyResult, RollbackResult

import datetime

# ─── analyze token 캐시 (프로세스 내 메모리) ─────────────────────────
# apply 없이 analyze만 반복하면 토큰이 무한 누적되므로 상한을 둔다(FIFO).
# 단일 사용자 데모 기준 상한이며, 초과 시 가장 오래된 미소비 토큰부터 밀어낸다.
_TOKEN_CACHE_MAX = 256
_token_cache: "OrderedDict[str, AnalyzeResponse]" = OrderedDict()


def store_token(response: AnalyzeResponse) -> str:
    token = str(uuid.uuid4())
    _token_cache[token] = response
    while len(_token_cache) > _TOKEN_CACHE_MAX:
        _token_cache.popitem(last=False)  # 가장 오래된 것 제거(FIFO)
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
        kind = str(create.args.get("kind", "")).upper()
        # CREATE TABLE → DROP TABLE
        if kind == "TABLE":
            schema_expr = create.find(exp.Schema)
            tbl = schema_expr.find(exp.Table) if schema_expr else create.find(exp.Table)
            if tbl:
                parts.append(f"DROP TABLE IF EXISTS {tbl.sql(dialect='postgres')};")
        # CREATE INDEX → DROP INDEX
        elif kind == "INDEX":
            idx = create.this
            idx_name = idx.this.sql(dialect="postgres") if idx and idx.this else None
            if idx_name:
                parts.append(f"DROP INDEX IF EXISTS {idx_name};")

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
                if col_name and action.args.get("dtype") is not None:
                    before_col = col_map.get(col_name)
                    if before_col:
                        parts.append(
                            f"ALTER TABLE {tbl.sql(dialect='postgres')} "
                            f"ALTER COLUMN {col_name} TYPE {before_col.type};"
                        )
                    else:
                        parts.append(
                            f"-- ROLLBACK UNSUPPORTED: ALTER TABLE {tbl.sql(dialect='postgres')} "
                            f"ALTER COLUMN {col_name} TYPE -- 원본 타입 정보 없음"
                        )

            # RENAME COLUMN → 역방향 RENAME
            elif isinstance(action, exp.RenameColumn):
                old_id = action.args.get("this")
                new_id = action.args.get("to")
                if old_id and new_id:
                    parts.append(
                        f"ALTER TABLE {tbl.sql(dialect='postgres')} "
                        f"RENAME COLUMN {new_id.name} TO {old_id.name};"
                    )

            # RENAME TABLE → 역방향 RENAME (옛 이름 = ALTER 대상 테이블, 새 이름 = action.this)
            elif isinstance(action, exp.AlterRename):
                new_name = action.this.name if action.this else None
                if new_name and tbl_name:
                    parts.append(f"ALTER TABLE {new_name} RENAME TO {tbl_name};")

            # ADD UNIQUE/PRIMARY KEY → 제약명 있으면 DROP CONSTRAINT, 없으면 복원 불가 표시
            elif isinstance(action, (exp.AddConstraint, exp.PrimaryKey)):
                constraint = action.find(exp.Constraint)
                cname = constraint.name if constraint else None
                if cname:
                    parts.append(
                        f"ALTER TABLE {tbl.sql(dialect='postgres')} DROP CONSTRAINT IF EXISTS {cname};"
                    )
                else:
                    parts.append(
                        f"-- ROLLBACK UNSUPPORTED: ALTER TABLE {tbl.sql(dialect='postgres')} "
                        f"ADD CONSTRAINT -- 제약명 미지정(익명 제약은 자동 롤백 불가)"
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
    confirm_critical: bool = False,
) -> ApplyResult:
    """SQL을 적용하고 MigrationHistory/AuditLog에 기록한다.

    보안 (fail-closed, 함수 직접호출 우회 방어):
    1. parse(sql) + check_forbidden(ast) — 금지 패턴(시스템 스키마 등) 항상 차단. 우회 불가.
    2. deterministic_rules(ast) — critical 위험은 기본 차단(실수 방지)하되,
       confirm_critical=True면 통과(경고는 했으니 적용은 사용자 판단).
    """
    from app.models.audit import AuditLog, MigrationHistory
    from app.pipeline.risk import deterministic_rules

    # ① 재검증 — 검증 우회 방지. 금지 패턴(보안)은 confirm과 무관하게 항상 차단.
    ast = parse(sql)
    violations = check_forbidden(ast)
    if violations:
        # UI 노출 문자열은 영어(주석은 한국어)
        raise ValidationError(f"Forbidden pattern: {violations[0].message}")

    # ② critical 위험 — 명시 확인이 없으면 차단(실수 방지). 확인 시 통과.
    critical_risks = [r for r in deterministic_rules(ast) if r.level == "critical"]
    if critical_risks and not confirm_critical:
        raise ValidationError(
            f"Critical-risk SQL cannot be applied without confirmation: {critical_risks[0].rule}"
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


# ─── apply_all (누적 dry-run 일괄 적용) ──────────────────────────────

def apply_all(
    sqls: list[str],
    session: Session,
    target_engine: Optional[Engine] = None,
    confirm_critical: bool = False,
):
    """N개 SQL을 단일 TX로 일괄 적용한다(all-or-nothing). SQL당 감사 로그 1건.

    보안 (fail-closed):
    1. TX 진입 전 전수 선검사 — 금지 패턴(보안)은 항상 거부. critical은 기본 거부하되
       confirm_critical=True면 통과(경고는 했으니 적용은 사용자 판단).
    2. 단일 engine.begin() — 중간 구문 실패 시 앞 구문까지 전부 롤백.
    3. down_script는 단계별 누적 baseline 기준으로 생성(apply_ast_to_graph로 fold).
    """
    from app.models.audit import AuditLog, MigrationHistory
    from app.pipeline.risk import deterministic_rules
    from app.pipeline.schema_graph import build_graph
    from app.pipeline.simulation import apply_ast_to_graph
    from app.schemas.analysis import ApplyAllResult

    if not sqls:
        raise ValidationError("적용할 SQL이 없습니다.")

    engine = target_engine if target_engine is not None else session.get_bind()

    # ① TX 진입 전 전수 선검사 — 하나라도 위반/critical이면 실행 전 전체 거부
    asts: list[exp.Expression] = []
    for i, s in enumerate(sqls):
        ast = parse(s)
        if check_forbidden(ast):  # 금지 패턴(보안) — 항상 차단, confirm 무관
            raise ValidationError(f"sqls[{i}] forbidden pattern: {s[:80]}")
        if not confirm_critical and any(r.level == "critical" for r in deterministic_rules(ast)):
            raise ValidationError(f"sqls[{i}] critical-risk SQL cannot be applied without confirmation: {s[:80]}")
        asts.append(ast)

    # ② 단일 target TX — 중간 실패 시 모두 롤백(all-or-nothing)
    graph = build_graph(engine)  # down_script 누적 생성용 baseline
    audit_ids: list[str] = []
    applied_at = ""

    with engine.begin() as conn:
        for s, ast in zip(sqls, asts):
            conn.execute(text(s))

    # ③ target TX 정상 종료 후 메타 기록 — SQL당 MigrationHistory+AuditLog 1건
    for s, ast in zip(sqls, asts):
        before_tables = {n.id: n for n in graph.nodes}
        down = build_down_script(ast, before_tables) or None
        migration = MigrationHistory(sql=s, down_script=down)
        session.add(migration)
        session.flush()

        audit = AuditLog(
            migration_id=migration.id,
            action="apply",
            detail=f"apply-all: {s[:200]}",
        )
        session.add(audit)
        session.flush()
        audit_ids.append(str(audit.id))
        applied_at = audit.created_at.isoformat() if audit.created_at else datetime.datetime.utcnow().isoformat()
        graph = apply_ast_to_graph(ast, graph)  # 다음 단계 down_script용 누적

    return ApplyAllResult(auditIds=audit_ids, appliedAt=applied_at, count=len(sqls))


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

    # 이중 롤백 가드: 같은 migration_id에 rollback 이벤트가 이미 있으면 down_script 재실행 차단.
    already_rolled_back = (
        session.query(AuditLog)
        .filter_by(migration_id=migration.id, action="rollback")
        .first()
    )
    if already_rolled_back is not None:
        raise ValidationError("This migration has already been rolled back.")

    down_sql = migration.down_script

    # down_script 각 구문을 parse+check_forbidden으로 검증 후 실행 (fail-closed)
    stmts = [s.strip() for s in down_sql.split(";") if s.strip() and not s.strip().startswith("--")]
    for stmt in stmts:
        stmt_ast = parse(stmt)
        stmt_violations = check_forbidden(stmt_ast)
        if stmt_violations:
            raise ValidationError(
                f"Rollback script forbidden pattern: {stmt_violations[0].message} (stmt: {stmt[:80]})"
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
