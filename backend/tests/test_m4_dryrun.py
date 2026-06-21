"""simulate_data dry-run 단위 테스트 — TDD test-first (M4).

구현: backend/app/pipeline/simulation.py
실제 시그니처 (구현 확인):
    def simulate_data(sql: str, engine: Engine) -> DataSimResult
    # BEGIN → 실행 → rowcount 수집 → ROLLBACK (강제, 절대 커밋 안 함)
DataSimResult (schemas/analysis.py):
    affectedRows: int
    estimatedRows: int

self-contained: SQLite in-memory 동기 engine 주입.
서버 불필요 — python -m pytest 단독 실행 가능.
"""

import pytest
from sqlalchemy import create_engine, text


# ---------------------------------------------------------------------------
# 픽스처 — SQLite in-memory, users 5행 시드
# ---------------------------------------------------------------------------

@pytest.fixture
def engine():
    """users 테이블 5행 시드 (동기 SQLite in-memory, 테스트마다 새 DB)."""
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as conn:
        conn.execute(text("""
            CREATE TABLE users (
                id   INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                age  INTEGER NOT NULL DEFAULT 0
            )
        """))
        for i in range(1, 6):
            conn.execute(
                text("INSERT INTO users (id, name, age) VALUES (:id, :name, :age)"),
                {"id": i, "name": f"user{i}", "age": 20 + i},
            )
    return eng


def _run(sql: str, eng):
    from app.pipeline.simulation import simulate_data  # noqa: PLC0415
    return simulate_data(sql, eng)


def _count(eng) -> int:
    with eng.connect() as conn:
        return conn.execute(text("SELECT COUNT(*) FROM users")).scalar()


def _count_where(eng, clause: str) -> int:
    with eng.connect() as conn:
        return conn.execute(text(f"SELECT COUNT(*) FROM users WHERE {clause}")).scalar()


# ---------------------------------------------------------------------------
# AC1: UPDATE → affectedRows > 0 + count(*) 불변
# ---------------------------------------------------------------------------

def test_update_returns_affected_rows(engine):
    """UPDATE → affectedRows > 0 반환."""
    result = _run("UPDATE users SET age = 99 WHERE age > 20", engine)
    assert result.affectedRows > 0, f"affectedRows={result.affectedRows}"


def test_update_data_unchanged_after_dryrun(engine):
    """UPDATE dry-run 후 실제 데이터 변화 없음 (age=99 인 행 0개)."""
    _run("UPDATE users SET age = 99", engine)
    changed = _count_where(engine, "age = 99")
    assert changed == 0, f"dry-run 후 age=99 인 행 {changed}개 — ROLLBACK 실패"


def test_update_total_count_unchanged(engine):
    """UPDATE dry-run 전후 total count(*) 동일(5행 유지)."""
    _run("UPDATE users SET age = 0", engine)
    assert _count(engine) == 5, f"dry-run 후 총 행 수={_count(engine)}, 5 기대"


# ---------------------------------------------------------------------------
# AC2: DELETE → affectedRows 반환 + 행 수 불변
# ---------------------------------------------------------------------------

def test_delete_returns_affected_rows(engine):
    """DELETE → affectedRows > 0 반환."""
    result = _run("DELETE FROM users WHERE id <= 3", engine)
    assert result.affectedRows > 0, f"affectedRows={result.affectedRows}"


def test_delete_data_unchanged_after_dryrun(engine):
    """DELETE dry-run 후 count(*) 변화 없음(5행 유지)."""
    _run("DELETE FROM users WHERE id <= 3", engine)
    assert _count(engine) == 5, f"DELETE dry-run 후 행 수={_count(engine)}, 5 기대"


def test_delete_all_data_unchanged_after_dryrun(engine):
    """DELETE 전체 dry-run 후 count(*) 불변."""
    _run("DELETE FROM users", engine)
    assert _count(engine) == 5, f"DELETE 전체 dry-run 후 행 수={_count(engine)}, 5 기대"


# ---------------------------------------------------------------------------
# AC3: dry-run 후 실제 데이터 미변경 — 별도 쿼리로 재확인
# ---------------------------------------------------------------------------

def test_dryrun_no_side_effect_separate_query(engine):
    """dry-run 전후 전체 row id 목록이 동일함을 별도 쿼리로 재확인."""
    with engine.connect() as conn:
        ids_before = [r[0] for r in conn.execute(text("SELECT id FROM users ORDER BY id"))]
    _run("DELETE FROM users", engine)
    with engine.connect() as conn:
        ids_after = [r[0] for r in conn.execute(text("SELECT id FROM users ORDER BY id"))]
    assert ids_before == ids_after, (
        f"dry-run 후 데이터 변경됨: before={ids_before}, after={ids_after}"
    )


def test_update_dryrun_values_unchanged(engine):
    """UPDATE dry-run 후 원본 age 값이 모두 유지됨."""
    with engine.connect() as conn:
        ages_before = sorted(r[0] for r in conn.execute(text("SELECT age FROM users")))
    _run("UPDATE users SET age = 0", engine)
    with engine.connect() as conn:
        ages_after = sorted(r[0] for r in conn.execute(text("SELECT age FROM users")))
    assert ages_before == ages_after, (
        f"dry-run 후 age 변경됨: before={ages_before}, after={ages_after}"
    )


# ---------------------------------------------------------------------------
# DataSimResult 계약 검증
# ---------------------------------------------------------------------------

def test_result_has_affected_rows_field(engine):
    """DataSimResult.affectedRows 필드 존재 및 int 타입."""
    result = _run("UPDATE users SET age = 1 WHERE id = 1", engine)
    assert hasattr(result, "affectedRows")
    assert isinstance(result.affectedRows, int)


def test_result_has_estimated_rows_field(engine):
    """DataSimResult.estimatedRows 필드 존재 및 int 타입."""
    result = _run("UPDATE users SET age = 1 WHERE id = 1", engine)
    assert hasattr(result, "estimatedRows")
    assert isinstance(result.estimatedRows, int)


def test_simulate_data_importable():
    """simulate_data 가 importable 하고 callable 한지 확인."""
    from app.pipeline.simulation import simulate_data  # noqa: PLC0415
    import inspect
    assert callable(simulate_data)
    # 구현은 동기 함수 (ARCHITECTURE §4 는 async 명시했으나 실제 구현은 동기 TX rollback 방식)
    params = inspect.signature(simulate_data).parameters
    assert "sql" in params, "simulate_data(sql, engine) 시그니처 필요"
    assert "engine" in params, "simulate_data(sql, engine) 시그니처 필요"
