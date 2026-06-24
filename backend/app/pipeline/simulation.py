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


def _inline_fk(col_def: exp.ColumnDef) -> tuple[str, str] | None:
    """컬럼 정의의 inline REFERENCES에서 (참조 테이블명, 참조 컬럼명)을 추출한다.

    예: `user_id INTEGER REFERENCES users(id)` → ("users", "id").
    참조 컬럼 미지정(`REFERENCES users`) 시 컬럼은 None 대신 빈 문자열로 둔다(엣지는 생성).
    """
    for c in col_def.args.get("constraints", []):
        kind = c.args.get("kind") if isinstance(c, exp.ColumnConstraint) else c
        if isinstance(kind, exp.Reference):
            ref_tbl = kind.find(exp.Table)
            if ref_tbl is None:
                return None
            # Reference 내부 Schema의 Identifier 중 테이블명이 아닌 것이 참조 컬럼.
            schema_expr = kind.find(exp.Schema)
            ref_col = ""
            if schema_expr:
                idents = [
                    i.name for i in schema_expr.find_all(exp.Identifier)
                    if i.name != ref_tbl.name
                ]
                ref_col = idents[0] if idents else ""
            return ref_tbl.name, ref_col
    return None


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
    fk_ref = _inline_fk(col_def)
    return ColumnNode(
        name=col_def.name,
        type=str(col_type).lower() if col_type else "unknown",
        pk=is_pk,
        fk=fk_ref[0] if fk_ref else None,  # 참조 테이블명(api 계약: fk = 테이블명)
        nullable=not is_not_null and not is_pk,
        diff=diff,  # type: ignore[arg-type]
    )


def _detect_schema(before: SchemaGraph) -> str | None:
    """before 그래프의 노드 id에서 스키마 prefix를 감지한다."""
    for node in before.nodes:
        if "." in node.id:
            return node.id.split(".")[0]
    return None


def apply_ast_to_graph(ast: exp.Expression, before: SchemaGraph) -> SchemaGraph:
    """AST를 before에 가상 적용해 '순수 after' 그래프를 반환한다(diff 플래그 마킹 없음).

    누적 dry-run의 fold 전용 — diff_graphs를 거치지 않은 순수 그래프라 다음 SQL의
    baseline으로 다시 먹일 수 있다(simulate_schema의 after는 diff 결과라 fold에 부적합).
    """
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
                col = _col_from_def(col_def, diff="added")
                # inline REFERENCES → 새 FK 엣지(관계선) 생성. 참조 테이블이 존재할 때만.
                fk_ref = _inline_fk(col_def)
                if fk_ref:
                    ref_tid = f"{fallback_schema}.{fk_ref[0]}" if fallback_schema else fk_ref[0]
                    if ref_tid in nodes:
                        eid = f"fk_{tbl.name}_{col_def.name}"
                        edges[eid] = FkEdge(
                            id=eid,
                            source=tid,
                            target=ref_tid,
                            sourceColumn=col_def.name,
                            targetColumn=fk_ref[1] or "id",
                            diff="added",
                        )
                    else:
                        # 참조 테이블이 없으면 FK 핸들(N)이 타깃 없이 떠 착시를 만든다 → fk 필드 정정.
                        col = col.model_copy(update={"fk": None})
                col_nodes.append(col)

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
                changed = True
                # ADD COLUMN ... REFERENCES → 새 FK 엣지(관계선) 생성.
                fk_ref = _inline_fk(action)
                if fk_ref:
                    ref_tid = f"{fallback_schema}.{fk_ref[0]}" if fallback_schema else fk_ref[0]
                    if ref_tid in nodes:
                        eid = f"fk_{tbl.name}_{action.name}"
                        edges[eid] = FkEdge(
                            id=eid,
                            source=tid,
                            target=ref_tid,
                            sourceColumn=action.name,
                            targetColumn=fk_ref[1] or "id",
                            diff="added",
                        )
                    else:
                        # 참조 테이블이 없으면 타깃 없는 FK 핸들 착시 → fk 필드 정정.
                        new_col = new_col.model_copy(update={"fk": None})
                col_map[new_col.name] = new_col

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

    return SchemaGraph(nodes=list(nodes.values()), edges=list(edges.values()))


def simulate_schema(ast: exp.Expression, before: SchemaGraph) -> SchemaSimResult:
    """AST를 before SchemaGraph에 가상 적용해 after를 만들고 diff를 산출한다."""
    after = apply_ast_to_graph(ast, before)
    diff = diff_graphs(before, after)
    return SchemaSimResult(before=before, after=diff)


def _normalize_unchanged(graph: SchemaGraph) -> SchemaGraph:
    """그래프의 모든 노드/컬럼/엣지 diff를 'unchanged'로 초기화한다.

    apply_ast_to_graph는 추가/변경 컬럼에 added/modified를 박는다. baseline은 '이미 확정된
    기준선'이므로 그 마킹을 지워야 split뷰 before가 깨끗하게(diff 색 없이) 보인다.
    """
    nodes = [
        n.model_copy(
            update={
                "diff": "unchanged",
                "columns": [c.model_copy(update={"diff": "unchanged", "change": None}) for c in n.columns],
            }
        )
        for n in graph.nodes
    ]
    edges = [e.model_copy(update={"diff": "unchanged"}) for e in graph.edges]
    return SchemaGraph(nodes=nodes, edges=edges)


def fold_baseline(prior_sqls: list[str], base: SchemaGraph) -> SchemaGraph:
    """실DB base 위에 prior_sqls를 순차 가상 적용한 '누적 baseline'을 반환한다.

    각 SQL은 parse + check_forbidden으로 재검증(fail-closed) — priorSqls는 프론트가
    보낸 신뢰 불가 입력이라 우회 금지. critical은 dry-run이라 막지 않는다(실DB 무변경).
    fold는 순수 그래프(apply_ast_to_graph)만 누적 — diff 그래프 절대 금지.
    마지막에 diff 마킹을 지워 baseline을 깨끗한 기준선으로 만든다(split뷰 before용).
    """
    graph = base
    for i, s in enumerate(prior_sqls):
        try:
            ast = parse(s)  # 멀티스테이트먼트/파싱 실패 → ValidationError
        except ValidationError as e:
            raise ValidationError(f"priorSqls[{i}] 파싱 실패: {e}")
        if check_forbidden(ast):
            raise ValidationError(f"priorSqls[{i}] 금지 패턴 위반")
        graph = apply_ast_to_graph(ast, graph)  # diff 없는 순수 누적
    return _normalize_unchanged(graph)


def simulate_cumulative(
    prior_sqls: list[str], current_ast: exp.Expression, base: SchemaGraph
) -> SchemaSimResult:
    """누적 dry-run 전체 diff: before=원본 실DB(base), after=(prior + current) 전부 적용.

    fold_baseline과 달리 normalize하지 않고 prior+current를 순수 누적한 뒤 base와 diff한다.
    → 스택에 쌓인 모든 변경이 한 화면에 added/modified/removed로 누적 표시된다.
    prior_sqls는 신뢰 불가 입력이라 parse+check_forbidden 재검증(fail-closed) 유지.
    """
    graph = base
    for i, s in enumerate(prior_sqls):
        try:
            ast = parse(s)
        except ValidationError as e:
            raise ValidationError(f"priorSqls[{i}] 파싱 실패: {e}")
        if check_forbidden(ast):
            raise ValidationError(f"priorSqls[{i}] 금지 패턴 위반")
        graph = apply_ast_to_graph(ast, graph)
    full_after = apply_ast_to_graph(current_ast, graph)
    diff = diff_graphs(base, full_after)
    return SchemaSimResult(before=base, after=diff)


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


def simulate_constraint_violation(ast: exp.Expression, engine: Engine):
    """ALTER가 SET NOT NULL이면, 적용 시 위반할 기존 NULL 행 수를 read-only로 센다.

    반환: (violations:int, hint_en:str, hint_ko:str) 또는 None(점검 비대상).
    - 오직 SELECT COUNT(*) 한 줄만 실행(쓰기 없음, target_engine 전용).
    - 테이블/컬럼 식별자는 AST에서 추출 후 따옴표로 감싸 주입(인젝션 방지).
    """
    if not isinstance(ast, exp.Alter) or str(ast.args.get("kind", "")).upper() != "TABLE":
        return None
    tbl = ast.find(exp.Table)
    if tbl is None:
        return None

    # SET NOT NULL 대상 컬럼명 추출(타입 변경이 아닌 NOT NULL 강제만)
    target_col: str | None = None
    for action in ast.args.get("actions", []):
        if (
            isinstance(action, exp.AlterColumn)
            and action.args.get("dtype") is None
            and action.args.get("allow_null") is False
        ):
            ident = action.args.get("this")
            if ident is not None:
                target_col = ident.name
                break
    if not target_col:
        return None

    # 식별자만 안전 재직렬화(리터럴 보간 없음). COUNT는 read-only.
    tbl_sql = tbl.sql(dialect="postgres")
    col_sql = exp.column(target_col).sql(dialect="postgres")
    count_sql = f"SELECT COUNT(*) FROM {tbl_sql} WHERE {col_sql} IS NULL"

    try:
        with engine.connect() as conn:
            n = conn.execute(text(count_sql)).scalar() or 0
    except Exception:
        return None  # 테이블/컬럼 부재 등 — 점검 불가 시 조용히 생략

    n = int(n)
    if n <= 0:
        en = f'No existing rows violate NOT NULL on "{target_col}" — safe to apply.'
        ko = f'"{target_col}"의 기존 행이 NOT NULL을 위반하지 않습니다 — 안전하게 적용 가능.'
    else:
        en = f'SET NOT NULL on "{target_col}" would reject {n:,} existing NULL row(s).'
        ko = f'"{target_col}"에 SET NOT NULL 적용 시 기존 NULL {n:,}행이 거부됩니다.'
    return n, en, ko


def estimate_table_size(engine: Engine, table: str):
    """테이블의 추정 행 수(reltuples)와 전체 크기를 read-only로 조회한다.

    반환: (est_rows:int, size_pretty:str) 또는 None(테이블 부재/조회 실패).
    - pg_class.reltuples는 ANALYZE가 갱신하는 추정치 — 전체 스캔 없이 즉시(대형 테이블 안전).
    - 식별자는 바인드 파라미터로 전달(인젝션 방지), 쓰기 없음(target_engine 전용).
    """
    query = text(
        """
        SELECT GREATEST(c.reltuples, 0)::bigint AS est_rows,
               pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = :t AND c.relkind = 'r'
        """
    )
    try:
        with engine.connect() as conn:
            row = conn.execute(query, {"t": table}).fetchone()
    except Exception:
        return None
    if row is None:
        return None
    return int(row[0]), str(row[1])


class _RollbackSignal(Exception):
    """simulate_data 전용 내부 rollback 트리거 — 절대 외부로 전파되지 않는다."""
