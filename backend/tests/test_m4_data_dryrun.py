"""M4 데이터 dry-run (TX rollback) 테스트 — acceptance_criteria 1-4 + 보안."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text

from app.pipeline.simulation import simulate_data
from app.pipeline.validation import ValidationError
from app.schemas.analysis import DataSimResult


@pytest.fixture()
def engine_with_data():
    """인메모리 SQLite + 시드 데이터."""
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER DEFAULT 1)"))
        conn.execute(text("INSERT INTO users (name, active) VALUES ('alice', 1), ('bob', 1), ('carol', 0)"))
    return engine


def _count(engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()


# ─────────────────────────────────────────────
# 1. DataSimResult 타입 반환
# ─────────────────────────────────────────────

def test_returns_data_sim_result(engine_with_data):
    result = simulate_data("DELETE FROM users WHERE active = 0", engine_with_data)
    assert isinstance(result, DataSimResult)


# ─────────────────────────────────────────────
# 2. affectedRows 정확성
# ─────────────────────────────────────────────

def test_delete_affected_rows(engine_with_data):
    """WHERE active=0 인 행 1개 → affectedRows=1."""
    result = simulate_data("DELETE FROM users WHERE active = 0", engine_with_data)
    assert result.affectedRows == 1


def test_delete_all_affected_rows(engine_with_data):
    """WHERE 없는 DELETE → affectedRows=3 (전체)."""
    result = simulate_data("DELETE FROM users", engine_with_data)
    assert result.affectedRows == 3


def test_update_affected_rows(engine_with_data):
    """active=1 인 행 2개 UPDATE → affectedRows=2."""
    result = simulate_data("UPDATE users SET active = 0 WHERE active = 1", engine_with_data)
    assert result.affectedRows == 2


def test_update_all_affected_rows(engine_with_data):
    """WHERE 없는 UPDATE → affectedRows=3."""
    result = simulate_data("UPDATE users SET active = 0", engine_with_data)
    assert result.affectedRows == 3


# ─────────────────────────────────────────────
# 3. ★ 데이터 불변 — ROLLBACK 보장
# ─────────────────────────────────────────────

def test_delete_does_not_commit(engine_with_data):
    """DELETE dry-run 후 실제 테이블 count는 변하지 않는다."""
    before_count = _count(engine_with_data, "users")
    simulate_data("DELETE FROM users WHERE active = 0", engine_with_data)
    after_count = _count(engine_with_data, "users")
    assert before_count == after_count


def test_delete_all_does_not_commit(engine_with_data):
    """WHERE 없는 DELETE dry-run 후에도 데이터 불변."""
    simulate_data("DELETE FROM users", engine_with_data)
    assert _count(engine_with_data, "users") == 3


def test_update_does_not_commit(engine_with_data):
    """UPDATE dry-run 후 실제 행 값이 바뀌지 않는다."""
    simulate_data("UPDATE users SET active = 0 WHERE active = 1", engine_with_data)
    with engine_with_data.connect() as conn:
        active_count = conn.execute(text("SELECT COUNT(*) FROM users WHERE active = 1")).scalar()
    assert active_count == 2


# ─────────────────────────────────────────────
# 4. estimatedRows (SQLite: affectedRows 폴백)
# ─────────────────────────────────────────────

def test_estimated_rows_is_non_negative(engine_with_data):
    result = simulate_data("DELETE FROM users", engine_with_data)
    assert result.estimatedRows >= 0


def test_sqlite_estimated_equals_affected(engine_with_data):
    """SQLite는 EXPLAIN FORMAT JSON 미지원 → estimatedRows = affectedRows."""
    result = simulate_data("DELETE FROM users WHERE active = 1", engine_with_data)
    assert result.estimatedRows == result.affectedRows


# ─────────────────────────────────────────────
# 5. 연속 호출 독립성 (idempotency)
# ─────────────────────────────────────────────

def test_idempotent_multiple_calls(engine_with_data):
    """동일 SQL을 두 번 dry-run해도 결과가 같다 (데이터가 안 바뀌므로)."""
    r1 = simulate_data("DELETE FROM users WHERE active = 0", engine_with_data)
    r2 = simulate_data("DELETE FROM users WHERE active = 0", engine_with_data)
    assert r1.affectedRows == r2.affectedRows


# ─────────────────────────────────────────────
# 6. ★ 보안 — 검증 우회 차단 + DDL 거부
# ─────────────────────────────────────────────

def test_system_schema_access_blocked(engine_with_data):
    """시스템 스키마(pg_catalog) 접근 → ValidationError (check_forbidden 차단)."""
    with pytest.raises(ValidationError):
        simulate_data("SELECT * FROM pg_catalog.pg_tables", engine_with_data)


def test_ddl_drop_table_rejected(engine_with_data):
    """DDL(DROP TABLE) → ValidationError — DML 화이트리스트 위반."""
    with pytest.raises(ValidationError):
        simulate_data("DROP TABLE users", engine_with_data)


def test_ddl_truncate_rejected(engine_with_data):
    """DDL(TRUNCATE) → ValidationError."""
    with pytest.raises(ValidationError):
        simulate_data("TRUNCATE TABLE users", engine_with_data)


def test_ddl_alter_table_rejected(engine_with_data):
    """DDL(ALTER TABLE) → ValidationError."""
    with pytest.raises(ValidationError):
        simulate_data("ALTER TABLE users ADD COLUMN x INTEGER", engine_with_data)


def test_ddl_create_table_rejected(engine_with_data):
    """DDL(CREATE TABLE) → ValidationError."""
    with pytest.raises(ValidationError):
        simulate_data("CREATE TABLE tmp (id INTEGER)", engine_with_data)
