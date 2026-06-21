"""schema_graph.build_graph() 단위 테스트 — SQLite in-memory로 검증."""

import pytest
from sqlalchemy import create_engine, text

from app.pipeline.schema_graph import build_graph, diff_graphs


@pytest.fixture(scope="module")
def sqlite_engine():
    """users + orders(FK) 샘플 스키마를 SQLite in-memory에 시드."""
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE users (
                id    INTEGER PRIMARY KEY,
                name  TEXT NOT NULL,
                email TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE orders (
                id      INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                total   REAL NOT NULL DEFAULT 0
            )
        """))
    return engine


def test_node_count(sqlite_engine):
    graph = build_graph(sqlite_engine, schema=None)
    assert len(graph.nodes) == 2, f"노드 2개 기대, 실제: {len(graph.nodes)}"


def test_edge_count(sqlite_engine):
    graph = build_graph(sqlite_engine, schema=None)
    assert len(graph.edges) == 1, f"FK 엣지 1개 기대, 실제: {len(graph.edges)}"


def test_pk_flag(sqlite_engine):
    graph = build_graph(sqlite_engine, schema=None)
    users_node = next(n for n in graph.nodes if n.table == "users")
    id_col = next(c for c in users_node.columns if c.name == "id")
    assert id_col.pk is True


def test_fk_flag(sqlite_engine):
    graph = build_graph(sqlite_engine, schema=None)
    orders_node = next(n for n in graph.nodes if n.table == "orders")
    user_id_col = next(c for c in orders_node.columns if c.name == "user_id")
    assert user_id_col.fk is not None


def test_diff_unchanged(sqlite_engine):
    graph = build_graph(sqlite_engine, schema=None)
    for node in graph.nodes:
        assert node.diff == "unchanged"
    for edge in graph.edges:
        assert edge.diff == "unchanged"


def test_diff_graphs_added_table(sqlite_engine):
    before = build_graph(sqlite_engine, schema=None)

    engine2 = create_engine("sqlite:///:memory:")
    with engine2.begin() as conn:
        conn.execute(text("""
            CREATE TABLE users (
                id    INTEGER PRIMARY KEY,
                name  TEXT NOT NULL,
                email TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE orders (
                id      INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                total   REAL NOT NULL DEFAULT 0
            )
        """))
        conn.execute(text("""
            CREATE TABLE products (
                id    INTEGER PRIMARY KEY,
                title TEXT NOT NULL
            )
        """))
    after = build_graph(engine2, schema=None)

    diff = diff_graphs(before, after)
    products_node = next((n for n in diff.nodes if n.table == "products"), None)
    assert products_node is not None
    assert products_node.diff == "added"
