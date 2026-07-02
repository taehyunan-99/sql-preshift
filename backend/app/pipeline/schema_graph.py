"""SQLAlchemy reflection → SchemaGraph JSON 빌드 + before/after diff."""

from __future__ import annotations

from sqlalchemy import Engine, inspect

from app.schemas.schema_graph import (
    ColumnChange,
    ColumnNode,
    DiffStatus,
    FkEdge,
    SchemaGraph,
    TableNode,
)


def _sa_type_str(col_type) -> str:
    """SQLAlchemy 컬럼 타입을 소문자 문자열로 변환."""
    try:
        return str(col_type).lower()
    except Exception:
        return "unknown"


# 앱 내부 메타 테이블 — 사용자 ERD/스키마 그래프에서 제외(대상 DB가 메타 DB와 동일할 때).
_APP_META_TABLES = frozenset(
    {"alembic_version", "migration_history", "audit_log", "schema_embeddings"}
)


def build_graph(engine: Engine, schema: str | None = "public") -> SchemaGraph:
    """대상 엔진을 reflection해 SchemaGraph를 반환한다.
    schema=None 이면 SQLite 등 스키마 개념이 없는 DB에도 동작한다.
    앱 메타 테이블(_APP_META_TABLES)은 사용자 관심 대상이 아니므로 제외한다.
    """
    insp = inspect(engine)
    table_names = [t for t in insp.get_table_names(schema=schema) if t not in _APP_META_TABLES]

    # 노드 id 앞에 붙는 prefix (schema 없으면 빈 문자열)
    schema_prefix = f"{schema}." if schema else ""

    nodes: list[TableNode] = []
    edges: list[FkEdge] = []

    for table in table_names:
        pk_cols = set(insp.get_pk_constraint(table, schema=schema).get("constrained_columns", []))
        fk_map: dict[str, tuple[str, str]] = {}  # col_name → (ref_table_id, ref_col)
        for fk in insp.get_foreign_keys(table, schema=schema):
            for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                ref_table = fk["referred_table"]
                ref_schema = fk.get("referred_schema") or schema
                ref_prefix = f"{ref_schema}." if ref_schema else ""
                fk_map[local_col] = (f"{ref_prefix}{ref_table}", ref_col)

        columns: list[ColumnNode] = []
        for col in insp.get_columns(table, schema=schema):
            col_name = col["name"]
            fk_target = None
            if col_name in fk_map:
                ref_table_id, ref_col = fk_map[col_name]
                fk_target = f"{ref_table_id}.{ref_col}"
            columns.append(
                ColumnNode(
                    name=col_name,
                    type=_sa_type_str(col["type"]),
                    pk=col_name in pk_cols,
                    fk=fk_target,
                    nullable=col.get("nullable", True),
                    diff="unchanged",
                )
            )

        nodes.append(
            TableNode(
                id=f"{schema_prefix}{table}",
                table=table,
                diff="unchanged",
                columns=columns,
            )
        )

        # FK 엣지 생성
        for fk in insp.get_foreign_keys(table, schema=schema):
            ref_schema = fk.get("referred_schema") or schema
            ref_table = fk["referred_table"]
            ref_prefix = f"{ref_schema}." if ref_schema else ""
            for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                edge_id = f"fk_{table}_{local_col}"
                edges.append(
                    FkEdge(
                        id=edge_id,
                        source=f"{schema_prefix}{table}",
                        target=f"{ref_prefix}{ref_table}",
                        sourceColumn=local_col,
                        targetColumn=ref_col,
                        diff="unchanged",
                    )
                )

    return SchemaGraph(nodes=nodes, edges=edges)


def diff_graphs(before: SchemaGraph, after: SchemaGraph) -> SchemaGraph:
    """before/after 두 SchemaGraph를 비교해 diff 플래그를 설정한 SchemaGraph를 반환한다."""
    before_tables = {n.id: n for n in before.nodes}
    after_tables = {n.id: n for n in after.nodes}
    before_edges = {e.id: e for e in before.edges}
    after_edges = {e.id: e for e in after.edges}

    result_nodes: list[TableNode] = []

    # after 기준 순회: added / modified / unchanged
    for tid, a_node in after_tables.items():
        if tid not in before_tables:
            # 새 테이블
            result_nodes.append(
                TableNode(
                    id=a_node.id,
                    table=a_node.table,
                    diff="added",
                    columns=[c.model_copy(update={"diff": "added"}) for c in a_node.columns],
                )
            )
        else:
            b_node = before_tables[tid]
            b_cols = {c.name: c for c in b_node.columns}
            a_cols = {c.name: c for c in a_node.columns}
            merged_cols: list[ColumnNode] = []
            table_diff: DiffStatus = "unchanged"

            for cname, a_col in a_cols.items():
                if cname not in b_cols:
                    merged_cols.append(a_col.model_copy(update={"diff": "added"}))
                    table_diff = "modified"
                else:
                    b_col = b_cols[cname]
                    if a_col.type != b_col.type:
                        merged_cols.append(
                            a_col.model_copy(
                                update={
                                    "diff": "modified",
                                    "change": ColumnChange(from_=b_col.type, to=a_col.type),
                                }
                            )
                        )
                        table_diff = "modified"
                    else:
                        merged_cols.append(a_col.model_copy(update={"diff": "unchanged"}))

            # before에만 있던 컬럼 → removed
            for cname, b_col in b_cols.items():
                if cname not in a_cols:
                    merged_cols.append(b_col.model_copy(update={"diff": "removed"}))
                    table_diff = "modified"

            result_nodes.append(
                TableNode(
                    id=a_node.id,
                    table=a_node.table,
                    diff=table_diff,
                    columns=merged_cols,
                    # 무결성 진단은 구조 변경과 무관한 실DB 속성 → before(base) 노드에서 보존.
                    # after(시뮬레이션 결과)엔 진단이 없으므로 b_node 기준으로 들고 온다.
                    # added/removed 테이블은 진단 비대상(신규/삭제)이라 기본값 False로 둔다.
                    isOrphan=b_node.isOrphan,
                )
            )

    # before에만 있는 테이블 → removed
    for tid, b_node in before_tables.items():
        if tid not in after_tables:
            result_nodes.append(
                TableNode(
                    id=b_node.id,
                    table=b_node.table,
                    diff="removed",
                    columns=[c.model_copy(update={"diff": "removed"}) for c in b_node.columns],
                )
            )

    result_edges: list[FkEdge] = []
    for eid, a_edge in after_edges.items():
        if eid not in before_edges:
            result_edges.append(a_edge.model_copy(update={"diff": "added"}))
        else:
            result_edges.append(a_edge.model_copy(update={"diff": "unchanged"}))
    for eid, b_edge in before_edges.items():
        if eid not in after_edges:
            result_edges.append(b_edge.model_copy(update={"diff": "removed"}))

    return SchemaGraph(nodes=result_nodes, edges=result_edges)
