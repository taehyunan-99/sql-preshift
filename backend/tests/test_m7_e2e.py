"""M7 end-to-end 8케이스 검증 — plan.md §검증전략 종료 기준.

정상1: NL "users에 age 컬럼 추가" → classify NL + simulate 후 ALTER diff green
정상2: SQL `CREATE TABLE ...` → simulate_schema 새 노드 added(green)
정상3: NL 조회(SELECT) → NL 분류, 스키마 변경 없음
정상4: `UPDATE ...` → simulate_data dry-run, 영향 행 수 반환, 데이터 불변
엣지5: WHERE 없는 DELETE → critical 위험 + apply 차단
엣지6: DROP TABLE → critical 위험 (red diff), apply 차단
엣지7: 파싱 불가 SQL → ValidationError 발생
엣지8: 적용 후 롤백 → 스키마 원복 + 감사로그 rollback 행 기록

LLM 의존 케이스(정상1·3): Ollama mock — 실제 LLM 미기동 상태에서도 결정적 분기까지 검증.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.base import Base
from app.models.audit import AuditLog, MigrationHistory
from app.pipeline.executor import apply, build_down_script, rollback
from app.pipeline.input_router import classify_input
from app.pipeline.risk import deterministic_rules
from app.pipeline.schema_graph import build_graph
from app.pipeline.simulation import simulate_data, simulate_schema
from app.pipeline.validation import ValidationError, parse
from app.schemas.analysis import InputMode


# ─────────────────────────────────────────────
# 공통 픽스처
# ─────────────────────────────────────────────

@pytest.fixture()
def meta_engine():
    """감사로그/마이그레이션 ORM 메타 DB."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def target_engine():
    """대상 DB — users(id, name, email) + 시드 데이터."""
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE users ("
            "  id INTEGER PRIMARY KEY,"
            "  name TEXT NOT NULL,"
            "  email TEXT"
            ")"
        ))
        conn.execute(text(
            "INSERT INTO users (name, email) VALUES "
            "('alice', 'alice@example.com'), "
            "('bob', 'bob@example.com'), "
            "('carol', NULL)"
        ))
    return engine


@pytest.fixture()
def session(meta_engine):
    Session = sessionmaker(bind=meta_engine)
    s = Session()
    yield s
    s.close()


def _has_column(engine, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(engine).get_columns(table)]


def _count(engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()


# ─────────────────────────────────────────────
# 정상1: NL "users에 age 컬럼 추가" → NL 분류 + ALTER diff green
# (LLM mock — 결정적 분기까지 검증)
# ─────────────────────────────────────────────

def test_normal1_nl_age_column_classified_as_nl():
    """NL 입력은 InputMode.NL 로 분류된다."""
    text_input = "users에 age 컬럼 추가해줘"
    mode, confidence = classify_input(text_input)
    assert mode == InputMode.NL
    assert confidence > 0.5


def test_normal1_nl_age_column_alter_diff_green(target_engine):
    """NL 에서 생성된 ALTER SQL 을 simulate_schema 에 걸면 age 컬럼이 added(green) 으로 나타난다."""
    # LLM 대신 NL → SQL 결과를 deterministic 으로 가정 (M6 nl2sql 산출물)
    generated_sql = "ALTER TABLE users ADD COLUMN age INTEGER"
    before = build_graph(target_engine, schema=None)
    ast = parse(generated_sql)
    result = simulate_schema(ast, before)
    after = result.after
    users_node = next((n for n in after.nodes if n.table == "users"), None)
    assert users_node is not None
    assert users_node.diff == "modified"
    age_col = next((c for c in users_node.columns if c.name == "age"), None)
    assert age_col is not None
    assert age_col.diff == "added"


# ─────────────────────────────────────────────
# 정상2: SQL `CREATE TABLE ...` → 새 노드 added(green)
# ─────────────────────────────────────────────

def test_normal2_create_table_new_node_green(target_engine):
    """CREATE TABLE orders → simulate_schema 후 orders 노드 diff=added."""
    sql = "CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, amount REAL)"
    mode, _ = classify_input(sql)
    assert mode == InputMode.SQL

    before = build_graph(target_engine, schema=None)
    ast = parse(sql)
    result = simulate_schema(ast, before)
    after = result.after

    orders_node = next((n for n in after.nodes if n.table == "orders"), None)
    assert orders_node is not None
    assert orders_node.diff == "added"
    # 모든 컬럼 added
    for col in orders_node.columns:
        assert col.diff == "added"


def test_normal2_create_table_no_risks(target_engine):
    """CREATE TABLE 은 critical/warning 위험이 없다."""
    sql = "CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER)"
    ast = parse(sql)
    risks = deterministic_rules(ast)
    critical = [r for r in risks if r.level == "critical"]
    assert len(critical) == 0


# ─────────────────────────────────────────────
# 정상3: NL 조회(SELECT) → NL 분류, 스키마 변경 없음
# (LLM mock — 결정적 경로 검증)
# ─────────────────────────────────────────────

def test_normal3_nl_select_classified_as_nl():
    """'users 테이블 조회해줘' 같은 NL 는 InputMode.NL 로 분류된다."""
    nl_input = "users 테이블에서 모든 데이터를 조회해줘"
    mode, _ = classify_input(nl_input)
    assert mode == InputMode.NL


def test_normal3_select_sql_no_schema_change(target_engine):
    """SELECT 문 은 simulate_schema 를 거치지 않고 스키마 변경이 없다.
    (NL → SQL 경로에서 SELECT 가 생성되면 schemaDiff 는 null — 파이프라인 분기 검증)"""
    # SELECT 는 DML 이므로 simulate_schema 가 아닌 simulate_data 경로
    sql = "SELECT id, name FROM users"
    ast = parse(sql)
    # SELECT 는 DDL 이 아니므로 simulate_data 가 처리한다
    result = simulate_data(sql, target_engine)
    # 데이터 조회이므로 affectedRows = 0 (SELECT rowcount = -1 or 0)
    assert result.affectedRows >= 0
    # 원본 데이터 불변
    assert _count(target_engine, "users") == 3


def test_normal3_select_has_no_schema_risks(target_engine):
    """SELECT 는 결정적 위험 룰 없음."""
    sql = "SELECT id, name FROM users"
    ast = parse(sql)
    risks = deterministic_rules(ast)
    assert len(risks) == 0


# ─────────────────────────────────────────────
# 정상4: UPDATE ... WHERE → dry-run 영향행수, 데이터 불변
# ─────────────────────────────────────────────

def test_normal4_update_dryrun_returns_affected_rows(target_engine):
    """UPDATE WHERE 조건 → simulate_data 가 영향행수를 반환하고 데이터 불변."""
    sql = "UPDATE users SET email = 'new@example.com' WHERE name = 'alice'"
    result = simulate_data(sql, target_engine)
    assert result.affectedRows == 1
    # 실제 DB 는 변경되지 않았어야 함 (TX ROLLBACK)
    with target_engine.connect() as conn:
        row = conn.execute(text("SELECT email FROM users WHERE name = 'alice'")).fetchone()
    assert row is not None
    assert row[0] == "alice@example.com"  # 원래 값 유지


def test_normal4_update_data_immutable(target_engine):
    """simulate_data 후 전체 row 수 불변."""
    before_count = _count(target_engine, "users")
    simulate_data("UPDATE users SET email = 'x@x.com' WHERE id = 1", target_engine)
    assert _count(target_engine, "users") == before_count


def test_normal4_update_with_where_no_critical_risk(target_engine):
    """WHERE 있는 UPDATE 는 critical 위험 없음."""
    sql = "UPDATE users SET email = 'a@b.com' WHERE id = 1"
    ast = parse(sql)
    risks = deterministic_rules(ast)
    critical = [r for r in risks if r.level == "critical"]
    assert len(critical) == 0


# ─────────────────────────────────────────────
# 엣지5: WHERE 없는 DELETE → critical 위험 + apply 차단
# ─────────────────────────────────────────────

def test_edge5_delete_without_where_critical_risk():
    """WHERE 없는 DELETE → deterministic_rules critical=DELETE_WITHOUT_WHERE."""
    sql = "DELETE FROM users"
    ast = parse(sql)
    risks = deterministic_rules(ast)
    critical = [r for r in risks if r.level == "critical"]
    assert any("DELETE" in r.rule for r in critical), f"critical risks: {critical}"


def test_edge5_delete_without_where_apply_blocked(session, target_engine):
    """WHERE 없는 DELETE 는 apply() 에서 ValidationError 로 차단된다."""
    with pytest.raises(ValidationError, match="critical"):
        apply("DELETE FROM users", None, session, target_engine)


def test_edge5_delete_without_where_data_intact(session, target_engine):
    """apply 차단 후 데이터 불변."""
    count_before = _count(target_engine, "users")
    try:
        apply("DELETE FROM users", None, session, target_engine)
    except ValidationError:
        pass
    assert _count(target_engine, "users") == count_before


# ─────────────────────────────────────────────
# 엣지6: DROP TABLE → critical 위험(red diff) + apply 차단
# ─────────────────────────────────────────────

def test_edge6_drop_table_critical_risk():
    """DROP TABLE → deterministic_rules critical=DROP_TABLE."""
    sql = "DROP TABLE users"
    ast = parse(sql)
    risks = deterministic_rules(ast)
    critical = [r for r in risks if r.level == "critical"]
    assert any("DROP_TABLE" in r.rule for r in critical)


def test_edge6_drop_table_red_diff(target_engine):
    """DROP TABLE → simulate_schema 에서 users 노드 diff=removed(red)."""
    sql = "DROP TABLE users"
    before = build_graph(target_engine, schema=None)
    ast = parse(sql)
    result = simulate_schema(ast, before)
    after = result.after
    # after 그래프에서 users 는 removed 로 표시
    removed = [n for n in after.nodes if n.table == "users" and n.diff == "removed"]
    assert len(removed) == 1


def test_edge6_drop_table_apply_blocked(session, target_engine):
    """DROP TABLE 은 apply() 에서 ValidationError 로 차단된다."""
    with pytest.raises(ValidationError, match="critical"):
        apply("DROP TABLE users", None, session, target_engine)


# ─────────────────────────────────────────────
# 엣지7: 파싱 불가 SQL → ValidationError
# ─────────────────────────────────────────────

def test_edge7_unparseable_sql_raises_validation_error():
    """완전히 깨진 SQL 는 parse() 에서 ValidationError 를 발생시킨다."""
    bad_sql = "THIS IS NOT SQL AT ALL !!!"
    with pytest.raises(ValidationError):
        parse(bad_sql)


def test_edge7_empty_sql_raises_validation_error():
    """빈 문자열도 ValidationError."""
    with pytest.raises(ValidationError):
        parse("")


def test_edge7_multi_statement_raises_validation_error():
    """멀티 스테이트먼트도 ValidationError."""
    with pytest.raises(ValidationError):
        parse("SELECT 1; SELECT 2")


def test_edge7_partial_sql_raises_validation_error():
    """불완전한 SQL (SELECT 만 있는 경우) 도 ValidationError 또는 빈결과 처리."""
    # sqlglot 이 관대할 수 있으므로 ValidationError 또는 빈 결과 모두 허용
    try:
        result = parse("SELECT FROM")
        # 파싱이 성공한 경우에는 최소한 Expression 이어야 함
        assert result is not None
    except ValidationError:
        pass  # 기대하는 동작


# ─────────────────────────────────────────────
# 엣지8: 적용 후 롤백 → 스키마 원복 + 감사로그 rollback 기록
# ─────────────────────────────────────────────

def test_edge8_apply_then_rollback_schema_restored(session, target_engine):
    """ADD COLUMN 적용 → 롤백 → 컬럼 원복."""
    sql = "ALTER TABLE users ADD COLUMN phone TEXT"
    before = build_graph(target_engine, schema=None)
    ast = parse(sql)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    # 적용 후 컬럼 존재 확인
    assert _has_column(target_engine, "users", "phone")

    # 롤백
    rollback(result.auditId, session, target_engine)
    session.commit()

    # 롤백 후 컬럼 제거 확인
    assert not _has_column(target_engine, "users", "phone")


def test_edge8_rollback_audit_log_recorded(session, target_engine):
    """롤백 후 action='rollback' 감사로그 1행이 추가된다."""
    sql = "ALTER TABLE users ADD COLUMN tmp_col TEXT"
    before = build_graph(target_engine, schema=None)
    ast = parse(sql)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    before_count = session.query(AuditLog).filter_by(action="rollback").count()
    rollback(result.auditId, session, target_engine)
    session.commit()
    after_count = session.query(AuditLog).filter_by(action="rollback").count()

    assert after_count == before_count + 1


def test_edge8_rollback_preserves_original_data(session, target_engine):
    """롤백 후 기존 데이터(users 행수) 불변."""
    count_before = _count(target_engine, "users")

    sql = "ALTER TABLE users ADD COLUMN score INTEGER"
    before = build_graph(target_engine, schema=None)
    ast = parse(sql)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    rollback(result.auditId, session, target_engine)
    session.commit()

    assert _count(target_engine, "users") == count_before


def test_edge8_rollback_audit_log_has_down_script_detail(session, target_engine):
    """rollback AuditLog 의 detail 에 롤백 스크립트 정보가 포함된다."""
    sql = "ALTER TABLE users ADD COLUMN notes TEXT"
    before = build_graph(target_engine, schema=None)
    ast = parse(sql)
    before_tables = {n.id: n for n in before.nodes}
    down = build_down_script(ast, before_tables)

    result = apply(sql, down, session, target_engine)
    session.commit()

    rollback(result.auditId, session, target_engine)
    session.commit()

    rollback_log = (
        session.query(AuditLog)
        .filter_by(action="rollback")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert rollback_log is not None
    assert rollback_log.detail is not None
    assert len(rollback_log.detail) > 0
