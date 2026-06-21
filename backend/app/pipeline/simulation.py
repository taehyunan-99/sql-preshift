"""스키마 가상 시뮬레이션 (LLM 없음, AST → after SchemaGraph) + 데이터 dry-run — ADR-009."""

from __future__ import annotations

import json

import sqlglot.expressions as exp
from sqlalchemy import Engine, text

from app.pipeline.schema_graph import diff_graphs
from app.pipeline.validation import ValidationError, check_forbidden, parse
from app.schemas.analysis import DataSimResult, SchemaSimResult
from app.schemas.schema_graph import ColumnNode, FkEdge, SchemaGraph, TableNode

# simulate_data가 실행할 수 있는 DML 타입 화이트리스트
_DML_TYPES = (exp.Select, exp.Insert, exp.Update, exp.Delete)


def _table_id(table_expr: exp.Table, fallback_schema: str | None = "public") -> str:
    """sqlglot Table 노드에서 테이블 id("schema.table" 또는 "table") 추출."""
    db = table_expr.args.get("db")
    name = table_expr.name
    schema = str(db) if db else (fallback_schema or "")
    return f"{schema}.{name}" if schema else name


def _col_from_def(col_def: exp.ColumnDef, diff: str = "unchanged") -> ColumnNode:
    constraints = col_def.args.get("constraints", [])
    is_pk = any(
        isinstance(c.args.get("kind"), exp.PrimaryKeyColumnConstraint)
        for c in constraints
        if isinstance(c, exp.ColumnConstraint)
    )
    is_not_null = any(
        isinstance(c.args.get("kind"), exp.NotNullColumnConstraint)
        for c in constraints
        if isinstance(c, exp.ColumnConstraint)
    )
    col_type = col_def.args.get("kind")
    return ColumnNode(
        name=col_def.name,
        type=str(col_type).lower() if col_type else "unknown",
        pk=is_pk,
        fk=None,
        nullable=not is_not_null and not is_pk,
        diff=diff,  # type: ignore[arg-type]
    )


def _detect_schema(before: SchemaGraph) -> str | None:
    """before 그래프의 노드 id에서 스키마 prefix를 감지한다."""
    for node in before.nodes:
        if "." in node.id:
            return node.id.split(".")[0]
    return None


def simulate_schema(ast: exp.Expression, before: SchemaGraph) -> SchemaSimResult:
    """AST를 before SchemaGraph에 가상 적용해 after SchemaGraph를 생성하고 diff를 산출한다."""
    # before 그래프에서 스키마 prefix 감지 (SQLite=None, PostgreSQL="public" 등)
    fallback_schema = _detect_schema(before)

    nodes: dict[str, TableNode] = {n.id: n.model_copy(deep=True) for n in before.nodes}
    edges: dict[str, FkEdge] = {e.id: e.model_copy(deep=True) for e in before.edges}

    # CREATE TABLE
    for create in ast.find_all(exp.Create):
        if str(create.args.get("kind", "")).upper() != "TABLE":
            continue
        schema_expr = create.find(exp.Schema)
        tbl = schema_expr.find(exp.Table) if schema_expr else create.find(exp.Table)
        if tbl is None:
            continue
        tid = _table_id(tbl, fallback_schema)
        if tid in nodes:
            continue

        col_nodes: list[ColumnNode] = []
        if schema_expr:
            for col_def in schema_expr.find_all(exp.ColumnDef):
                col_nodes.append(_col_from_def(col_def, diff="added"))

        nodes[tid] = TableNode(
            id=tid,
            table=tbl.name,
            diff="added",
            columns=col_nodes,
        )

    # DROP TABLE
    for drop in ast.find_all(exp.Drop):
        if str(drop.args.get("kind", "")).upper() != "TABLE":
            continue
        tbl = drop.find(exp.Table)
        if tbl is None:
            continue
        tid = _table_id(tbl, fallback_schema)
        nodes.pop(tid, None)
        to_remove = [eid for eid, e in edges.items() if e.source == tid or e.target == tid]
        for eid in to_remove:
            edges.pop(eid, None)

    # ALTER TABLE
    for alter in ast.find_all(exp.Alter):
        if str(alter.args.get("kind", "")).upper() != "TABLE":
            continue
        tbl = alter.find(exp.Table)
        if tbl is None:
            continue
        tid = _table_id(tbl, fallback_schema)
        if tid not in nodes:
            continue

        node = nodes[tid]
        col_map: dict[str, ColumnNode] = {c.name: c for c in node.columns}
        changed = False

        for action in alter.args.get("actions", []):
            # ADD COLUMN
            if isinstance(action, exp.ColumnDef):
                new_col = _col_from_def(action, diff="added")
                col_map[new_col.name] = new_col
                changed = True

            # DROP COLUMN
            elif isinstance(action, exp.Drop):
                col_kind = str(action.args.get("kind", "")).upper()
                if col_kind == "COLUMN":
                    col_ref = action.find(exp.Column)
                    if col_ref and col_ref.name in col_map:
                        col_map.pop(col_ref.name)
                        changed = True

            # ALTER COLUMN (타입 변경 등)
            elif isinstance(action, exp.AlterColumn):
                # AlterColumn.args["this"]는 Identifier — find(exp.Column)이 None 반환
                col_ident = action.args.get("this")
                col_name = col_ident.name if col_ident else None
                if col_name and col_name in col_map:
                    dtype = action.args.get("dtype")
                    if dtype:
                        old_col = col_map[col_name]
                        col_map[col_name] = old_col.model_copy(
                            update={"type": str(dtype).lower(), "diff": "modified"}
                        )
                        changed = True

        if changed:
            nodes[tid] = node.model_copy(
                update={"columns": list(col_map.values()), "diff": "modified"}
            )

    after = SchemaGraph(nodes=list(nodes.values()), edges=list(edges.values()))
    diff = diff_graphs(before, after)
    return SchemaSimResult(before=before, after=diff)


def simulate_data(sql: str, engine: Engine) -> DataSimResult:
    """BEGIN → DML 실행 → rowcount 수집 → EXPLAIN 추정 → ROLLBACK (절대 커밋 안 함).

    보안 계층:
    1. parse(sql) → check_forbidden(ast) 로 검증 우회 불가(fail-closed).
    2. DDL(DROP/TRUNCATE/ALTER/CREATE 등)은 실행 거부 — simulate_schema 경로 전용.
    3. EXPLAIN 은 AST.sql() 재직렬화본만 사용(f-string 보간 금지).
    """
    # ① 파싱 + 금지패턴 검증 — ValidationError/Violation 시 즉시 거부
    ast = parse(sql)
    violations = check_forbidden(ast)
    if violations:
        raise ValidationError(f"금지 패턴 위반: {violations[0].message}")

    # ② DML 화이트리스트 — DDL은 simulate_schema 경로만 허용
    if not isinstance(ast, _DML_TYPES):
        raise ValidationError(
            f"simulate_data는 DML(SELECT/INSERT/UPDATE/DELETE)만 허용합니다. "
            f"DDL은 simulate_schema를 사용하세요. (감지된 타입: {type(ast).__name__})"
        )

    # ③ AST 재직렬화 — 원시 sql 문자열 대신 검증된 AST에서 생성
    safe_sql = ast.sql(dialect="postgres")

    dialect_name = engine.dialect.name
    affected = 0
    estimated = 0

    # ROLLBACK 보장: with engine.begin() 블록 안에서 예외를 일부러 발생시켜 rollback
    try:
        with engine.begin() as conn:
            result = conn.execute(text(safe_sql))
            affected = result.rowcount if result.rowcount is not None and result.rowcount >= 0 else 0

            # EXPLAIN — PostgreSQL 전용, AST 재직렬화본 사용(f-string 금지)
            if dialect_name == "postgresql":
                try:
                    explain_sql = f"EXPLAIN (FORMAT JSON) {safe_sql}"
                    explain_rows = conn.execute(text(explain_sql)).fetchone()
                    if explain_rows:
                        plan = json.loads(explain_rows[0])
                        estimated = int(plan[0]["Plan"].get("Plan Rows", affected))
                    else:
                        estimated = affected
                except Exception:
                    estimated = affected
            else:
                estimated = affected

            # 강제 rollback — 커밋하지 않는다
            raise _RollbackSignal()
    except _RollbackSignal:
        pass

    return DataSimResult(affectedRows=affected, estimatedRows=estimated)


class _RollbackSignal(Exception):
    """simulate_data 전용 내부 rollback 트리거 — 절대 외부로 전파되지 않는다."""
