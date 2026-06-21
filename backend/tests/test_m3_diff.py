"""M3 스키마 diff 검증 테스트 (acceptance_criteria 4·5)."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text

from app.pipeline.schema_graph import build_graph, diff_graphs
from app.pipeline.simulation import simulate_schema
from app.pipeline.validation import parse
from app.schemas.schema_graph import ColumnChange, ColumnNode, FkEdge, SchemaGraph, TableNode


@pytest.fixture(scope="module")
def base_graph():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)"))
        conn.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id))"))
    return build_graph(engine, schema=None)


# ─────────────────────────────────────────────
# diff_graphs 직접 단위 테스트
# ─────────────────────────────────────────────

def _make_graph(*nodes: TableNode, edges=None) -> SchemaGraph:
    return SchemaGraph(nodes=list(nodes), edges=edges or [])


def _col(name: str, type_: str = "text", pk=False, diff="unchanged") -> ColumnNode:
    return ColumnNode(name=name, type=type_, pk=pk, fk=None, nullable=True, diff=diff)


def test_diff_added_table():
    before = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id")])
    )
    after = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id")]),
        TableNode(id="products", table="products", diff="unchanged", columns=[_col("id"), _col("title")]),
    )
    result = diff_graphs(before, after)
    ids = {n.id: n for n in result.nodes}
    assert ids["users"].diff == "unchanged"
    assert ids["products"].diff == "added"
    assert all(c.diff == "added" for c in ids["products"].columns)


def test_diff_removed_table():
    before = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id")]),
        TableNode(id="tmp", table="tmp", diff="unchanged", columns=[_col("x")]),
    )
    after = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id")])
    )
    result = diff_graphs(before, after)
    ids = {n.id: n for n in result.nodes}
    assert ids["tmp"].diff == "removed"
    assert all(c.diff == "removed" for c in ids["tmp"].columns)


def test_diff_added_column():
    before = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id"), _col("name")])
    )
    after = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id"), _col("name"), _col("age", "integer")])
    )
    result = diff_graphs(before, after)
    node = result.nodes[0]
    assert node.diff == "modified"
    cols = {c.name: c for c in node.columns}
    assert cols["age"].diff == "added"
    assert cols["id"].diff == "unchanged"
    assert cols["name"].diff == "unchanged"


def test_diff_removed_column():
    before = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id"), _col("name"), _col("phone")])
    )
    after = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("id"), _col("name")])
    )
    result = diff_graphs(before, after)
    node = result.nodes[0]
    assert node.diff == "modified"
    cols = {c.name: c for c in node.columns}
    assert cols["phone"].diff == "removed"


def test_diff_modified_column_with_change():
    """컬럼 타입 변경 → modified + change.from/to."""
    before = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("bio", "varchar")])
    )
    after = _make_graph(
        TableNode(id="users", table="users", diff="unchanged", columns=[_col("bio", "text")])
    )
    result = diff_graphs(before, after)
    node = result.nodes[0]
    assert node.diff == "modified"
    bio = next(c for c in node.columns if c.name == "bio")
    assert bio.diff == "modified"
    assert bio.change is not None
    assert bio.change.from_ == "varchar"
    assert bio.change.to == "text"


def test_diff_change_json_serialization():
    """change 필드가 JSON으로 직렬화 시 'from' 키를 가져야 한다 (ARCHITECTURE §5)."""
    col = ColumnNode(
        name="bio", type="text", pk=False, fk=None, nullable=True,
        diff="modified", change=ColumnChange(from_="varchar", to="text")
    )
    data = col.model_dump(by_alias=True)
    assert "change" in data
    assert data["change"]["from"] == "varchar"
    assert data["change"]["to"] == "text"
    assert "from_" not in data["change"]


def test_diff_unchanged_all():
    """동일 그래프 diff → 모두 unchanged."""
    node = TableNode(id="users", table="users", diff="unchanged", columns=[_col("id"), _col("name")])
    before = _make_graph(node)
    after = _make_graph(node.model_copy(deep=True))
    result = diff_graphs(before, after)
    assert result.nodes[0].diff == "unchanged"
    assert all(c.diff == "unchanged" for c in result.nodes[0].columns)


def test_diff_edge_added():
    """FK 엣지 added/removed/unchanged."""
    edge_a = FkEdge(id="fk1", source="orders", target="users", sourceColumn="user_id", targetColumn="id", diff="unchanged")
    before = SchemaGraph(nodes=[], edges=[])
    after = SchemaGraph(nodes=[], edges=[edge_a])
    result = diff_graphs(before, after)
    assert result.edges[0].diff == "added"


def test_diff_edge_removed():
    edge_a = FkEdge(id="fk1", source="orders", target="users", sourceColumn="user_id", targetColumn="id", diff="unchanged")
    before = SchemaGraph(nodes=[], edges=[edge_a])
    after = SchemaGraph(nodes=[], edges=[])
    result = diff_graphs(before, after)
    assert result.edges[0].diff == "removed"


# ─────────────────────────────────────────────
# simulate_schema 경유 diff (acceptance_criteria 4)
# ─────────────────────────────────────────────

def test_simulate_add_column_produces_modified_node(base_graph):
    """ALTER TABLE users ADD COLUMN age int → users=modified, age=added."""
    ast = parse("ALTER TABLE users ADD COLUMN age INT")
    result = simulate_schema(ast, base_graph)

    users = next(n for n in result.after.nodes if "users" in n.id)
    assert users.diff == "modified"

    age_col = next((c for c in users.columns if c.name == "age"), None)
    assert age_col is not None
    assert age_col.diff == "added"


def test_simulate_drop_table_produces_removed_node(base_graph):
    """DROP TABLE orders → orders=removed."""
    ast = parse("DROP TABLE orders")
    result = simulate_schema(ast, base_graph)

    orders = next((n for n in result.after.nodes if "orders" in n.id), None)
    assert orders is not None
    assert orders.diff == "removed"


def test_simulate_alter_type_produces_modified_column_with_change(base_graph):
    """ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255) → email=modified + change."""
    ast = parse("ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255)")
    result = simulate_schema(ast, base_graph)

    users = next(n for n in result.after.nodes if "users" in n.id)
    assert users.diff == "modified"

    email = next((c for c in users.columns if c.name == "email"), None)
    assert email is not None
    assert email.diff == "modified"
    assert email.change is not None
    assert email.change.to.startswith("varchar") or "varchar" in email.change.to.lower()


def test_simulate_before_is_all_unchanged(base_graph):
    """`result.before` 의 모든 노드/컬럼 diff는 unchanged."""
    ast = parse("ALTER TABLE users ADD COLUMN score INT")
    result = simulate_schema(ast, base_graph)

    for node in result.before.nodes:
        assert node.diff == "unchanged", f"{node.id}.diff={node.diff}"
        for col in node.columns:
            assert col.diff == "unchanged", f"{node.id}.{col.name}.diff={col.diff}"


def test_simulate_schema_result_structure(base_graph):
    """SchemaSimResult 에 before/after 두 필드 모두 SchemaGraph 타입."""
    ast = parse("CREATE TABLE tags (id SERIAL PRIMARY KEY)")
    result = simulate_schema(ast, base_graph)
    assert isinstance(result.before, SchemaGraph)
    assert isinstance(result.after, SchemaGraph)
