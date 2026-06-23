"""DB 무결성 진단 — SchemaGraph에 read-only·metadata-only 진단 필드를 채운다.

build_graph()가 만든 base 그래프에 박는다(이후 diff 흐름이 model_copy로 보존).
모두 metadata-only라 어떤 DB 크기에서도 즉답한다. row-scan이 필요한
Broken Referential Integrity는 다음 세션에서 추가한다(이번엔 필드 기본값만).

함정 방어:
- target_engine 전용. pg_stats 조회도 사용자 DB 메타데이터만 읽는다(read-only).
- 진단 SQL은 파라미터 바인딩만 사용(raw 문자열 결합 금지) — forbidden gate가
  내부 쿼리엔 안 걸리므로 injection을 자력 방어한다.
- 휴리스틱 결과는 estimated/inferred 라벨로 UI에서 표기(여기선 데이터만 채움).
"""

from __future__ import annotations

from sqlalchemy import Engine, text
from sqlalchemy.sql import quoted_name

from app.schemas.schema_graph import FkEdge, SchemaGraph

# High-NULL 임계 — near-saturation NULL(거의 안 쓰이는 vestigial FK)만 표시.
# 0.2 같은 낮은 값은 정상 optional FK(coupon_id/manager_id/assignee_id)를 오플래그한다
# (현업 조사: optional 관계는 NULL이 많은 게 정상, 보편 임계는 없음 — GX/dbt). 0.98만 신호.
_HIGH_NULL_THRESHOLD = 0.98

# 암묵 FK 타입 매치용 정수 계열 그룹 — 정확 문자열 대신 계열로 느슨히 비교한다
# (user_id integer ↔ users.id bigint 처럼 폭만 다른 흔한 경우를 매치).
_INT_TYPE_TOKENS = ("int", "serial")

# --- 현업 조사 기반 denylist (false-positive 차단) ---

# Orphan denylist: FK 없이 standalone이 정상인 테이블 — 무결성 문제로 플래그하지 않는다.
# (현업: log/audit/staging/config/집계 테이블은 의도적으로 FK가 없다 — Red-Gate/Azimutt/SchemaCrawler)
_STANDALONE_TABLE_SUFFIXES = (
    "_log", "_audit", "_history", "_staging", "_stg",
    "_config", "_metrics", "_mv", "_archive",
)
_STANDALONE_SCHEMAS = frozenset(
    {"staging", "etl", "audit", "log", "archive", "reporting", "analytics"}
)

# Implicit FK denylist: '_id'로 끝나도 FK가 아닌 surrogate/외부시스템 id (정확 매칭).
# (현업: external_id/session_id 등은 다른 테이블 PK를 안 가리킨다 — surrogate key, sqlstyle.guide)
_NON_FK_ID_COLUMNS = frozenset(
    {
        "external_id", "session_id", "request_id", "correlation_id",
        "trace_id", "message_id", "transaction_id", "idempotency_key",
    }
)
_NON_FK_ID_SUFFIXES = ("_uuid", "_guid", "_hash")

# 멀티테넌시 관용 컬럼 — 정상이라 추정 FK로 표시하지 않는다(suppress). (Ecto/Rails 멀티테넌시)
_MULTITENANCY_COLUMNS = frozenset(
    {"tenant_id", "org_id", "account_id", "company_id"}
)

# Broken Referential 가드 상수
# sentinel/magic 값 — "no relation" 관용구. 고아 값 판정에서 제외. (Dataedo)
_FK_SENTINELS = (0, -1)
# soft-delete 마커 — deleted_at(timestamp, NULL=살아있음)만 신뢰한다. is_deleted 같은 boolean은
# 값 의미(true/false 방향)가 스키마마다 달라 IS NOT NULL 판정에 오탐 소지가 커 제외(미해결 §).
_SOFT_DELETE_COLUMNS = frozenset({"deleted_at"})
# row-scan 안전 임계 — child가 이보다 크면 비용 보호로 broken 체크 skip(데모 안전마진).
# (대형 child의 TABLESAMPLE 폴백은 범위 밖 — n홉/실측 미해결로 둠.)
_BROKEN_SCAN_MAX_ROWS = 2_000_000


def annotate_diagnostics(
    graph: SchemaGraph, engine: Engine, schema: str | None = "public"
) -> SchemaGraph:
    """base 그래프에 무결성 진단 필드를 in-place로 채워 그대로 반환한다."""
    # 순서 주의: 암묵 FK 엣지를 먼저 추가해야 orphan 판정이 그 추정 관계까지 고려한다
    # (점선 엣지가 붙은 테이블을 ISOLATED로 표시하는 모순 방지).
    _annotate_implicit_fks(graph)
    _annotate_orphan_tables(graph)
    _annotate_high_null(graph, engine, schema)
    _annotate_broken_referential(graph, engine, schema)
    return graph


def _schema_of(node_id: str) -> str | None:
    """node.id('schema.table')에서 schema 부분을 추출. prefix 없으면 None."""
    return node_id.split(".")[0] if "." in node_id else None


def _is_standalone_table(node) -> bool:
    """FK 없이 standalone이 정상인 테이블(log/audit/staging/config 등)인지 denylist 판정."""
    if node.table.endswith(_STANDALONE_TABLE_SUFFIXES):
        return True
    sch = _schema_of(node.id)
    return sch is not None and sch in _STANDALONE_SCHEMAS


def _annotate_orphan_tables(graph: SchemaGraph) -> None:
    """FK in/out 둘 다 없는 고립 테이블에 isOrphan=True. edges만으로 판정(SQL 0).

    현업 보정: (1) FK가 한 개도 없는 house-style DB(FK-free 아키텍처)는 전 테이블이
    무관계라 orphan 판정 자체를 skip. (2) log/audit/staging 등 의도적 standalone은 제외.
    "제약 없음 ≠ 관계 깨짐" — 무차별 ISOLATED 플래깅 방지.
    """
    # (B) 실제 FK가 한 개도 없으면(추정 엣지 제외) 전 테이블이 무관계 → 판정 전역 skip.
    if not any(not e.isEstimated for e in graph.edges):
        return

    connected: set[str] = set()
    for e in graph.edges:
        connected.add(e.source)
        connected.add(e.target)
    for node in graph.nodes:
        # (A) denylist 매치 테이블은 고립이어도 정상 → isOrphan 미부여.
        if node.id not in connected and not _is_standalone_table(node):
            node.isOrphan = True


def _is_int_type(type_str: str) -> bool:
    return any(tok in type_str for tok in _INT_TYPE_TOKENS)


def _types_compatible(a: str, b: str) -> bool:
    """암묵 FK 후보의 타입 음성 필터 — 양성 신호가 아니라 reject 전용.

    int끼리는 거의 다 통과해 변별력이 0이므로(모든 *_id가 int) confidence 가산에는
    절대 쓰지 않는다. 타입이 명백히 안 맞는 후보를 떨어뜨리는 용도일 뿐.
    """
    if _is_int_type(a) and _is_int_type(b):
        return True
    return a == b


def _annotate_implicit_fks(graph: SchemaGraph) -> None:
    """`<table>_id`/`<table>_ids` 네이밍 + PK 타입 매치인데 실제 FK 없는 컬럼 탐지.

    매치 시 column.implicitFkHint + 추정 엣지(isEstimated)를 추가한다. naming 휴리스틱이라
    precision 근거가 없어(어떤 도구도 미공표) UI는 estimated로만 표기하고 경고색을 안 쓴다.
    현업 보정: surrogate/외부id denylist, polymorphic 가드, 멀티테넌시 suppress, confidence tier.
    """
    # 테이블명 → (node.id, PK 컬럼명, PK 타입) 맵. PK가 단일일 때만 후보.
    pk_by_table: dict[str, tuple[str, str, str]] = {}
    for node in graph.nodes:
        pk_cols = [c for c in node.columns if c.pk]
        if len(pk_cols) == 1:
            pk_by_table[node.table] = (node.id, pk_cols[0].name, pk_cols[0].type)

    new_edges: list[FkEdge] = []

    for node in graph.nodes:
        col_names = {c.name for c in node.columns}
        for col in node.columns:
            if col.fk is not None:
                continue
            # '_id' 또는 '_ids'(복수형 관계) 둘 다 신호. (Azimutt)
            if col.name.endswith("_ids"):
                base = col.name[: -len("_ids")]
            elif col.name.endswith("_id"):
                base = col.name[: -len("_id")]
            else:
                continue

            # denylist: surrogate/외부시스템 id는 FK가 아니다.
            if col.name in _NON_FK_ID_COLUMNS or col.name.endswith(_NON_FK_ID_SUFFIXES):
                continue
            # 멀티테넌시 관용 컬럼은 정상이라 suppress(추정 표시 안 함).
            if col.name in _MULTITENANCY_COLUMNS:
                continue
            # polymorphic 가드: 같은 노드에 {base}_type/{base}_kind가 있으면 단일 테이블로
            # 환원 불가(Rails polymorphic) → 추정 엣지 금지.
            if f"{base}_type" in col_names or f"{base}_kind" in col_names:
                continue

            # confidence: 단수형 직접 매칭=high, 복수형으로만 매칭=medium(모호).
            if base in pk_by_table:
                ref, confidence = base, "high"
            elif f"{base}s" in pk_by_table:
                ref, confidence = f"{base}s", "medium"
            else:
                continue
            ref_id, ref_pk_col, ref_pk_type = pk_by_table[ref]
            if ref_id == node.id:  # 자기 참조 후보 제외(노이즈)
                continue
            if not _types_compatible(col.type, ref_pk_type):
                continue

            col.implicitFkHint = ref_id
            # edge_id는 (table, col)당 유일하고 실제 FK(fk_*)와 네임스페이스(impfk_*)가 달라 충돌 없음.
            new_edges.append(
                FkEdge(
                    id=f"impfk_{node.table}_{col.name}",
                    source=node.id,
                    target=ref_id,
                    sourceColumn=col.name,
                    targetColumn=ref_pk_col,
                    diff="unchanged",
                    isEstimated=True,
                    estimatedConfidence=confidence,
                )
            )

    graph.edges.extend(new_edges)


def _annotate_high_null(graph: SchemaGraph, engine: Engine, schema: str | None) -> None:
    """pg_stats.null_frac이 임계 이상인 (실/암묵) FK 컬럼에 highNullRatio를 채운다.

    pg_stats는 ANALYZE가 만든 통계라 metadata-only(즉답)지만 신선도에 의존한다
    → UI가 "based on last ANALYZE" 캐비엇으로 표기한다. ANALYZE 안 됐으면 행이
    없어 아무것도 안 채워진다(graceful).
    """
    if schema is None:  # 스키마 개념 없는 DB(SQLite 등)는 pg_stats 없음 → 건너뜀
        return

    # 실/암묵 FK 컬럼만 대상(노이즈 억제) — (table, col) 집합으로 필터.
    fk_cols: set[tuple[str, str]] = set()
    for node in graph.nodes:
        for col in node.columns:
            if col.fk is not None or col.implicitFkHint is not None:
                fk_cols.add((node.table, col.name))
    if not fk_cols:
        return

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT tablename, attname, null_frac "
                    "FROM pg_stats "
                    "WHERE schemaname = :schema AND null_frac >= :threshold"
                ),
                {"schema": schema, "threshold": _HIGH_NULL_THRESHOLD},
            ).fetchall()
    except Exception:
        return  # pg_stats 미지원/권한 부족 등 — 진단 실패가 파이프라인을 막지 않게

    null_frac_map = {
        (r.tablename, r.attname): float(r.null_frac) for r in rows
    }
    for node in graph.nodes:
        for col in node.columns:
            key = (node.table, col.name)
            if key in fk_cols and key in null_frac_map:
                col.highNullRatio = null_frac_map[key]


def _qualified(node_id: str) -> str:
    """node.id('schema.table' 또는 'table')를 SQL identifier로 안전하게 quote.

    식별자는 파라미터 바인딩이 안 되므로 quoted_name으로 감싸 injection을 막는다
    (forbidden gate가 내부 쿼리엔 안 걸리므로 자력 방어).
    """
    parts = node_id.split(".")
    return ".".join(str(quoted_name(p, quote=True)) for p in parts)


def _annotate_broken_referential(
    graph: SchemaGraph, engine: Engine, schema: str | None
) -> None:
    """실제 FK 엣지에 대해 자식 FK 값이 부모 PK에 없는 고아 값(broken RI)을 탐지한다.

    유일한 row-scan 진단. false-positive 차단 가드(현업 조사):
    - NULL FK는 정당한 "no relation" → 제외(누락 시 100% 오탐).
    - sentinel(0/-1)은 "no relation" 관용값 → 제외.
    - 부모 soft-delete(deleted_at 등)는 물리 anti-join이 못 잡음 → 별도 softDeletedParentRef
      informational로만 분리(warning 미합산).
    - 추정 엣지(isEstimated)엔 실행 안 함 → naming 오탐이 broken으로 전파되는 것 차단.
    - child가 과대하면 비용 보호로 skip.

    NOT IN 금지(부모 PK에 NULL 있으면 false-negative) → NOT EXISTS 상관 서브쿼리.
    """
    if schema is None:
        return

    node_by_id = {n.id: n for n in graph.nodes}
    # 실제 FK 엣지만(추정 제외). 컬럼 진단을 쓰려면 source 컬럼명도 필요.
    real_edges = [e for e in graph.edges if not e.isEstimated]
    if not real_edges:
        return

    # child row 수 추정(pg_stat_user_tables) — 과대 테이블 skip용. 실패해도 graceful.
    row_counts: dict[str, int] = {}
    try:
        with engine.connect() as conn:
            for r in conn.execute(
                text(
                    "SELECT relname, n_live_tup FROM pg_stat_user_tables "
                    "WHERE schemaname = :schema"
                ),
                {"schema": schema},
            ):
                row_counts[r.relname] = int(r.n_live_tup)
    except Exception:
        row_counts = {}

    try:
        with engine.connect() as conn:
            for edge in real_edges:
                child = node_by_id.get(edge.source)
                parent = node_by_id.get(edge.target)
                if child is None or parent is None:
                    continue
                # 비용 보호: child가 과대하면 skip.
                if row_counts.get(child.table, 0) > _BROKEN_SCAN_MAX_ROWS:
                    continue

                child_col = next(
                    (c for c in child.columns if c.name == edge.sourceColumn), None
                )
                if child_col is None:
                    continue

                child_sql = _qualified(child.id)
                parent_sql = _qualified(parent.id)
                fk_col = str(quoted_name(edge.sourceColumn, quote=True))
                pk_col = str(quoted_name(edge.targetColumn, quote=True))

                # sentinel 가드는 정수 키에만 적용(텍스트 키엔 0/-1이 의미 없음).
                sentinel_clause = ""
                if _is_int_type(child_col.type):
                    sentinels = ", ".join(str(s) for s in _FK_SENTINELS)
                    sentinel_clause = f"AND c.{fk_col} NOT IN ({sentinels}) "

                # 1) 물리 고아 값 존재? (부모 행 자체가 아예 없음 — soft-delete는 행이 존재하므로
                #    여기 안 걸린다). 걸리면 진짜 깨진 데이터 → brokenReferential warning.
                hard_orphan = conn.execute(
                    text(
                        f"SELECT EXISTS (SELECT 1 FROM {child_sql} c "
                        f"WHERE c.{fk_col} IS NOT NULL {sentinel_clause}"
                        f"AND NOT EXISTS (SELECT 1 FROM {parent_sql} p "
                        f"WHERE p.{pk_col} = c.{fk_col}))"
                    )
                ).scalar()
                if hard_orphan:
                    child_col.brokenReferential = True  # 진짜 깨진 데이터(warning)
                    continue

                # 2) 물리 고아는 없지만 부모가 soft-delete된 것을 참조하는가?
                #    → 논리적 broken이나 물리 행 존재 → informational(gray, 미합산).
                parent_soft_col = next(
                    (c.name for c in parent.columns if c.name in _SOFT_DELETE_COLUMNS),
                    None,
                )
                if parent_soft_col is not None:
                    soft_col = str(quoted_name(parent_soft_col, quote=True))
                    has_soft_ref = conn.execute(
                        text(
                            f"SELECT EXISTS (SELECT 1 FROM {child_sql} c "
                            f"JOIN {parent_sql} p ON p.{pk_col} = c.{fk_col} "
                            f"WHERE p.{soft_col} IS NOT NULL)"
                        )
                    ).scalar()
                    if has_soft_ref:
                        child_col.softDeletedParentRef = True  # informational(미합산)
    except Exception:
        return  # 진단 실패가 파이프라인을 막지 않게(권한/타입 불일치 등)
