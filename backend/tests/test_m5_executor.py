"""M5 executor + API 테스트 — acceptance_criteria 1-5."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.base import Base
from app.models.audit import AuditLog, MigrationHistory
from app.pipeline.executor import (
    apply,
    build_down_script,
    consume_token,
    rollback,
    store_token,
)
from app.pipeline.schema_graph import build_graph
from app.pipeline.validation import ValidationError, parse
from app.schemas.analysis import AnalyzeResponse


# ─────────────────────────────────────────────
# 픽스처
# ─────────────────────────────────────────────

@pytest.fixture()
def meta_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def target_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)"
        ))
    return engine


@pytest.fixture()
def session(meta_engine):
    Session = sessionmaker(bind=meta_engine)
    s = Session()
    yield s
    s.close()


def _has_column(engine, table: str, column: str) -> bool:
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns(table)]
    return column in cols


def _has_table(engine, table: str) -> bool:
    insp = inspect(engine)
    return table in insp.get_table_names()


# ─────────────────────────────────────────────
# 1. build_down_script
# ─────────────────────────────────────────────

def test_build_down_script_add_column(target_engine):
    """ADD COLUMN → DROP COLUMN."""
    before = build_graph(target_engine, schema=None)
    ast = parse("ALTER TABLE users ADD COLUMN age INTEGER")
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)
    assert "DROP COLUMN" in down.upper()
    assert "age" in down.lower()


def test_build_down_script_create_table(target_engine):
    """CREATE TABLE → DROP TABLE."""
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    ast = parse("CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER)")
    down = build_down_script(ast, before_tables)
    assert "DROP TABLE" in down.upper()
    assert "orders" in down.lower()


def test_build_down_script_drop_table_restores(target_engine):
    """DROP TABLE → CREATE TABLE (before 스냅샷 재구성)."""
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    ast = parse("DROP TABLE users")
    down = build_down_script(ast, before_tables)
    assert "CREATE TABLE" in down.upper()
    assert "users" in down.lower()


def test_build_down_script_not_null_preserved(target_engine):
    """DROP COLUMN → ADD COLUMN 복원 시 NOT NULL 컬럼은 NOT NULL 포함."""
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    # name TEXT NOT NULL 컬럼을 DROP
    ast = parse("ALTER TABLE users DROP COLUMN name")
    down = build_down_script(ast, before_tables)
    assert "NOT NULL" in down.upper()


# ─────────────────────────────────────────────
# 2. apply — 단일 TX + 감사로그 1행
# ─────────────────────────────────────────────

def test_apply_creates_migration_and_audit(session, target_engine):
    """apply → MigrationHistory 1행 + AuditLog 1행."""
    sql = "ALTER TABLE users ADD COLUMN age INTEGER"
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    ast = parse(sql)
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    assert result.auditId is not None
    assert int(result.auditId) >= 1
    assert _has_column(target_engine, "users", "age")


def test_apply_records_down_script(session, target_engine):
    """apply 후 MigrationHistory에 down_script가 저장된다."""
    sql = "ALTER TABLE users ADD COLUMN bio TEXT"
    ast = parse(sql)
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    # auditId로 AuditLog 조회 → migration_id → MigrationHistory
    from app.models.audit import AuditLog
    audit = session.get(AuditLog, int(result.auditId))
    assert audit is not None
    migration = session.get(MigrationHistory, audit.migration_id)
    assert migration is not None
    assert migration.down_script is not None
    assert "DROP COLUMN" in migration.down_script.upper()


# ─────────────────────────────────────────────
# 3. 승인 → 적용 → 롤백 시 스키마 원복
# ─────────────────────────────────────────────

def test_apply_and_rollback_schema_restored(session, target_engine):
    """ADD COLUMN 적용 후 롤백 → 컬럼 원복."""
    sql = "ALTER TABLE users ADD COLUMN phone TEXT"
    ast = parse(sql)
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()
    assert _has_column(target_engine, "users", "phone")

    rollback(result.auditId, session, target_engine)
    session.commit()
    assert not _has_column(target_engine, "users", "phone")


def test_apply_create_and_rollback(session, target_engine):
    """CREATE TABLE 적용 후 롤백 → 테이블 삭제."""
    sql = "CREATE TABLE tmp_tbl (id INTEGER PRIMARY KEY)"
    ast = parse(sql)
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()
    assert _has_table(target_engine, "tmp_tbl")

    rollback(result.auditId, session, target_engine)
    session.commit()
    assert not _has_table(target_engine, "tmp_tbl")


def test_rollback_audit_log_created(session, target_engine):
    """롤백 후 action='rollback' AuditLog 1행이 추가된다."""
    sql = "ALTER TABLE users ADD COLUMN extra TEXT"
    ast = parse(sql)
    before = build_graph(target_engine, schema=None)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    before_count = session.query(AuditLog).filter_by(action="rollback").count()
    rollback(result.auditId, session, target_engine)
    session.commit()
    after_count = session.query(AuditLog).filter_by(action="rollback").count()
    assert after_count == before_count + 1


# ─────────────────────────────────────────────
# 4. critical 위험 차단 — executor.apply() 함수 레벨
# ─────────────────────────────────────────────

def test_critical_risk_delete_without_where(target_engine):
    """WHERE 없는 DELETE → deterministic_rules에서 critical 반환."""
    from app.pipeline.risk import deterministic_rules
    ast = parse("DELETE FROM users")
    risks = deterministic_rules(ast)
    assert any(r.level == "critical" and "DELETE" in r.rule for r in risks)


def test_critical_risk_drop_table(target_engine):
    """DROP TABLE → deterministic_rules에서 critical 반환."""
    from app.pipeline.risk import deterministic_rules
    ast = parse("DROP TABLE users")
    risks = deterministic_rules(ast)
    assert any(r.level == "critical" and "DROP_TABLE" in r.rule for r in risks)


def test_apply_blocks_critical_delete(session, target_engine):
    """apply() 함수 직접호출 시에도 critical DELETE는 ValidationError."""
    with pytest.raises(ValidationError, match="critical"):
        apply("DELETE FROM users", None, session, target_engine)


def test_apply_blocks_critical_drop_table(session, target_engine):
    """apply() 함수 직접호출 시에도 critical DROP TABLE은 ValidationError."""
    with pytest.raises(ValidationError, match="critical"):
        apply("DROP TABLE users", None, session, target_engine)


def test_rollback_validates_each_stmt(session, target_engine):
    """rollback() 내 down_script 구문도 check_forbidden 게이트를 통과해야 한다."""
    # 악의적으로 조작된 down_script를 가진 MigrationHistory를 직접 삽입
    migration = MigrationHistory(
        sql="ALTER TABLE users ADD COLUMN x TEXT",
        down_script="SELECT * FROM pg_catalog.pg_tables",  # forbidden
    )
    session.add(migration)
    session.flush()
    audit = AuditLog(migration_id=migration.id, action="apply", detail="test")
    session.add(audit)
    session.flush()
    session.commit()

    with pytest.raises(ValidationError):
        rollback(audit.id, session, target_engine)


# ─────────────────────────────────────────────
# 5. token 캐시 — store/consume
# ─────────────────────────────────────────────

def test_token_store_and_consume():
    """store_token → consume_token 정상 동작."""
    dummy = AnalyzeResponse(
        mode="sql",
        detectedConfidence=1.0,
        sql="SELECT 1",
        explanation="조회",
        valid=True,
        violations=[],
        schemaDiff=None,
        dataSim=None,
        risks=[],
        downScript=None,
        token="",
    )
    token = store_token(dummy)
    assert len(token) > 0
    result = consume_token(token)
    assert result.sql == "SELECT 1"


def test_consume_token_invalid():
    """존재하지 않는 token → ValidationError."""
    with pytest.raises(ValidationError):
        consume_token("nonexistent-token-xyz")


def test_consume_token_single_use():
    """token은 1회만 사용 가능 (consume 후 재사용 불가)."""
    dummy = AnalyzeResponse(
        mode="sql", detectedConfidence=1.0, sql="SELECT 1",
        explanation="", valid=True, violations=[], schemaDiff=None,
        dataSim=None, risks=[], downScript=None, token="",
    )
    token = store_token(dummy)
    consume_token(token)
    with pytest.raises(ValidationError):
        consume_token(token)


# ─────────────────────────────────────────────
# 6. rollback — 없는 audit_id
# ─────────────────────────────────────────────

def test_rollback_invalid_audit_id(session, target_engine):
    """존재하지 않는 audit_id → ValidationError."""
    with pytest.raises(ValidationError):
        rollback(99999, session, target_engine)
