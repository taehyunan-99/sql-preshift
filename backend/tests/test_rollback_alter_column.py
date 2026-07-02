"""롤백 버그 2종 회귀 테스트.

버그 A: ALTER COLUMN SET/DROP DEFAULT, SET/DROP NOT NULL의 down_script 생성.
버그 B: rollback_batch의 all-or-nothing(부분 롤백 방지) + 다단계 baseline.

단위 테스트는 build_down_script 문자열만 검증(DB 불필요).
e2e는 실 PostgreSQL이 필요해 _pg_skip 게이트로 분리(SET DEFAULT/NOT NULL은 PG 문법).
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.base import Base
from app.models.audit import AuditLog, MigrationHistory
from app.pipeline.executor import (
    apply_all,
    build_down_script,
    rollback_batch,
)
from app.pipeline.schema_graph import build_graph
from app.pipeline.validation import ValidationError, parse
from app.schemas.schema_graph import ColumnNode, TableNode


# ─────────────────────────────────────────────
# 단위: build_down_script — ALTER COLUMN 역연산 (DB 불필요)
# ─────────────────────────────────────────────

def _before(cols):
    """{name: (type, nullable, default)} → before_tables dict."""
    node = TableNode(
        id="t",
        table="t",
        diff="unchanged",
        columns=[
            ColumnNode(name=n, type=t, pk=False, fk=None, nullable=nl,
                       columnDefault=d, diff="unchanged")
            for n, (t, nl, d) in cols.items()
        ],
    )
    return {"t": node}


def test_set_not_null_down_is_drop_not_null():
    ast = parse("ALTER TABLE t ALTER COLUMN c SET NOT NULL")
    down = build_down_script(ast, _before({"c": ("text", True, None)}))
    assert "DROP NOT NULL" in down
    assert down.strip()  # 비어있지 않음 → 404 회피


def test_drop_not_null_down_is_set_not_null():
    ast = parse("ALTER TABLE t ALTER COLUMN c DROP NOT NULL")
    down = build_down_script(ast, _before({"c": ("text", False, None)}))
    assert "SET NOT NULL" in down


def test_set_default_down_drops_when_no_prev_default():
    # 이전에 default가 없던 컬럼 → 역연산은 DROP DEFAULT
    ast = parse("ALTER TABLE t ALTER COLUMN c SET DEFAULT 'new'")
    down = build_down_script(ast, _before({"c": ("text", True, None)}))
    assert "DROP DEFAULT" in down
    assert down.strip()  # 비어있지 않음 → rollback ValidationError/404 회피


def test_set_default_down_restores_prev_default():
    # 이전에 default가 있던 컬럼을 바꿈 → 역연산은 원래 default로 SET (silent corruption 방지)
    ast = parse("ALTER TABLE t ALTER COLUMN c SET DEFAULT 'new'")
    down = build_down_script(ast, _before({"c": ("text", True, "'pending'::text")}))
    assert "SET DEFAULT 'pending'::text" in down
    assert "DROP DEFAULT" not in down


def test_drop_default_down_restores_prev_default():
    ast = parse("ALTER TABLE t ALTER COLUMN c DROP DEFAULT")
    down = build_down_script(ast, _before({"c": ("integer", True, "0")}))
    assert "SET DEFAULT 0" in down


def test_drop_default_unsupported_when_no_prev():
    # 이전 default를 모르면 정확 복원 불가 → 주석만(실행문 없음)
    ast = parse("ALTER TABLE t ALTER COLUMN c DROP DEFAULT")
    down = build_down_script(ast, _before({"c": ("integer", True, None)}))
    assert "ROLLBACK UNSUPPORTED" in down
    # 실행 가능한 SQL 라인은 없어야 함(주석 뿐)
    exec_lines = [l for l in down.splitlines() if l.strip() and not l.strip().startswith("--")]
    assert exec_lines == []


def test_alter_column_discrimination():
    # DROP DEFAULT(drop=True, allow_null 없음)와 DROP NOT NULL(drop=True, allow_null=True) 구분
    down_drop_default = build_down_script(
        parse("ALTER TABLE t ALTER COLUMN c DROP DEFAULT"),
        _before({"c": ("integer", True, "0")}),
    )
    down_drop_notnull = build_down_script(
        parse("ALTER TABLE t ALTER COLUMN c DROP NOT NULL"),
        _before({"c": ("integer", False, None)}),
    )
    assert "SET DEFAULT" in down_drop_default and "NOT NULL" not in down_drop_default
    assert "SET NOT NULL" in down_drop_notnull and "DEFAULT" not in down_drop_notnull


# ─────────────────────────────────────────────
# e2e: 실 PostgreSQL 필요 (SET DEFAULT/NOT NULL은 PG 문법)
# ─────────────────────────────────────────────

_PG_URL = os.environ.get("TEST_PG_URL", "postgresql+psycopg://demo:demo@pg_erp:5432/erp")


def _pg_available():
    try:
        e = create_engine(_PG_URL)
        with e.connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


_pg_skip = pytest.mark.skipif(not _pg_available(), reason="PostgreSQL target 미가용")


@pytest.fixture()
def meta_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


@pytest.fixture()
def pg_target():
    """격리 테스트 테이블 — 각 테스트 전후 drop."""
    engine = create_engine(_PG_URL)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS _rb_test"))
        conn.execute(text(
            "CREATE TABLE _rb_test (id bigint PRIMARY KEY, status text NOT NULL DEFAULT 'pending', note text)"
        ))
    yield engine
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS _rb_test"))


@_pg_skip
def test_apply_all_then_batch_rollback_set_default_roundtrip(meta_session, pg_target):
    # status는 원래 default 'pending'. SET DEFAULT 'new'로 바꾼 뒤 batch 롤백하면 'pending'으로 복원.
    res = apply_all(
        ["ALTER TABLE _rb_test ALTER COLUMN status SET DEFAULT 'new'"],
        meta_session, target_engine=pg_target, confirm_critical=True,
    )
    insp = inspect(pg_target)
    default_after = next(c["default"] for c in insp.get_columns("_rb_test") if c["name"] == "status")
    assert "new" in str(default_after)  # 적용됨

    rollback_batch(res.auditIds, meta_session, target_engine=pg_target)
    insp = inspect(create_engine(_PG_URL))  # 새 inspector로 재조회
    default_rolled = next(c["default"] for c in insp.get_columns("_rb_test") if c["name"] == "status")
    assert "pending" in str(default_rolled)  # 원래 default로 복원 — silent corruption 없음


@_pg_skip
def test_batch_rollback_all_or_nothing(meta_session, pg_target):
    # 2건 적용(note 컬럼 추가 + status SET DEFAULT). 배치 롤백은 둘 다 되돌려야 함.
    res = apply_all(
        [
            "ALTER TABLE _rb_test ADD COLUMN extra text",
            "ALTER TABLE _rb_test ALTER COLUMN status SET DEFAULT 'new'",
        ],
        meta_session, target_engine=pg_target, confirm_critical=True,
    )
    rollback_batch(res.auditIds, meta_session, target_engine=pg_target)
    insp = inspect(create_engine(_PG_URL))
    cols = {c["name"]: c for c in insp.get_columns("_rb_test")}
    assert "extra" not in cols  # ADD COLUMN 롤백됨
    assert "pending" in str(cols["status"]["default"])  # SET DEFAULT 롤백됨


@_pg_skip
def test_batch_rollback_precheck_rejects_missing_down(meta_session, pg_target):
    # down_script 없는 migration을 섞으면 TX 진입 전 전체 거부 → target 무변경.
    res = apply_all(
        ["ALTER TABLE _rb_test ADD COLUMN extra text"],
        meta_session, target_engine=pg_target, confirm_critical=True,
    )
    # down_script를 강제로 비워 선검사 실패 유발
    mig = meta_session.query(MigrationHistory).first()
    mig.down_script = None
    meta_session.flush()
    with pytest.raises(ValidationError):
        rollback_batch(res.auditIds, meta_session, target_engine=pg_target)
    # target 무변경 — extra 컬럼 아직 존재
    insp = inspect(create_engine(_PG_URL))
    assert "extra" in {c["name"] for c in insp.get_columns("_rb_test")}
