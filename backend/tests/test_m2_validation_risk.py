"""M2 결정적 파이프라인 단위 테스트 (LLM 없음)."""

import pytest
import sqlglot

from app.pipeline.input_router import classify_input
from app.pipeline.validation import ValidationError, check_forbidden, parse
from app.pipeline.risk import deterministic_rules
from app.pipeline.simulation import simulate_schema
from app.pipeline.schema_graph import build_graph
from app.schemas.analysis import InputMode
from sqlalchemy import create_engine, text


# ─────────────────────────────────────────────
# classify_input
# ─────────────────────────────────────────────

def test_classify_sql_select():
    mode, conf = classify_input("SELECT * FROM users")
    assert mode == InputMode.SQL
    assert conf == 1.0


def test_classify_sql_alter():
    mode, conf = classify_input("ALTER TABLE users ADD COLUMN age INT")
    assert mode == InputMode.SQL


def test_classify_nl():
    mode, conf = classify_input("사용자 테이블에 나이 컬럼을 추가해줘")
    assert mode == InputMode.NL
    assert conf >= 0.9


def test_classify_empty():
    mode, _ = classify_input("")
    assert mode == InputMode.NL


# ─────────────────────────────────────────────
# parse + check_forbidden
# ─────────────────────────────────────────────

def test_parse_valid():
    ast = parse("SELECT id FROM users WHERE id = 1")
    assert ast is not None


def test_parse_invalid_raises():
    with pytest.raises(ValidationError):
        parse("THIS IS NOT SQL %%%")


def test_check_forbidden_system_schema():
    ast = parse("SELECT * FROM pg_catalog.pg_tables")
    violations = check_forbidden(ast)
    rules = [v.rule for v in violations]
    assert "SYSTEM_SCHEMA" in rules


def test_check_forbidden_clean():
    ast = parse("SELECT * FROM users")
    violations = check_forbidden(ast)
    assert violations == []


# ─────────────────────────────────────────────
# deterministic_rules
# ─────────────────────────────────────────────

def test_drop_table_critical():
    ast = parse("DROP TABLE users")
    risks = deterministic_rules(ast)
    rules = [r.rule for r in risks]
    assert "DROP_TABLE" in rules
    assert any(r.level == "critical" for r in risks if r.rule == "DROP_TABLE")


def test_delete_without_where_critical():
    ast = parse("DELETE FROM users")
    risks = deterministic_rules(ast)
    rules = [r.rule for r in risks]
    assert "DELETE_WITHOUT_WHERE" in rules
    assert any(r.level == "critical" for r in risks if r.rule == "DELETE_WITHOUT_WHERE")


def test_delete_with_where_no_risk():
    ast = parse("DELETE FROM users WHERE id = 1")
    risks = deterministic_rules(ast)
    assert not any(r.rule == "DELETE_WITHOUT_WHERE" for r in risks)


def test_update_without_where_critical():
    ast = parse("UPDATE users SET name = 'x'")
    risks = deterministic_rules(ast)
    assert any(r.rule == "UPDATE_WITHOUT_WHERE" and r.level == "critical" for r in risks)


def test_truncate_critical():
    ast = parse("TRUNCATE TABLE orders")
    risks = deterministic_rules(ast)
    assert any(r.rule == "TRUNCATE" and r.level == "critical" for r in risks)


def test_drop_column_critical():
    ast = parse("ALTER TABLE users DROP COLUMN email")
    risks = deterministic_rules(ast)
    assert any(r.rule == "DROP_COLUMN" and r.level == "critical" for r in risks)


def test_add_not_null_no_default_warning():
    ast = parse("ALTER TABLE users ADD COLUMN score INT NOT NULL")
    risks = deterministic_rules(ast)
    assert any(r.rule == "ADD_NOT_NULL_NO_DEFAULT" and r.level == "warning" for r in risks)


def test_add_not_null_with_default_no_warning():
    ast = parse("ALTER TABLE users ADD COLUMN score INT NOT NULL DEFAULT 0")
    risks = deterministic_rules(ast)
    assert not any(r.rule == "ADD_NOT_NULL_NO_DEFAULT" for r in risks)


def test_cascade_warning():
    ast = parse("DROP TABLE orders CASCADE")
    risks = deterministic_rules(ast)
    assert any(r.rule == "CASCADE" and r.level == "warning" for r in risks)


# ─────────────────────────────────────────────
# simulate_schema
# ─────────────────────────────────────────────

@pytest.fixture(scope="module")
def base_graph():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"))
        conn.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id))"))
    return build_graph(engine, schema=None)


def test_simulate_create_table(base_graph):
    ast = parse("CREATE TABLE products (id SERIAL PRIMARY KEY, title TEXT NOT NULL)")
    result = simulate_schema(ast, base_graph)
    table_ids = [n.id for n in result.after.nodes]
    assert any("products" in tid for tid in table_ids)
    products = next(n for n in result.after.nodes if "products" in n.id)
    assert products.diff == "added"


def test_simulate_drop_table(base_graph):
    ast = parse("DROP TABLE orders")
    result = simulate_schema(ast, base_graph)
    # diff 결과에서 orders는 "removed" 플래그로 포함됨
    orders_node = next((n for n in result.after.nodes if "orders" in n.id), None)
    assert orders_node is not None
    assert orders_node.diff == "removed"


def test_simulate_before_unchanged(base_graph):
    ast = parse("CREATE TABLE tags (id SERIAL PRIMARY KEY)")
    result = simulate_schema(ast, base_graph)
    # before 노드는 unchanged
    for node in result.before.nodes:
        assert node.diff == "unchanged"
