from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

DiffStatus = Literal["added", "removed", "modified", "unchanged"]


class ColumnChange(BaseModel):
    """#2: from_ 을 직렬화 시 'from' 키로 출력한다 (serialization_alias)."""
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(serialization_alias="from")
    to: str


class ColumnNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    type: str
    pk: bool
    fk: Optional[str]  # "target_table.target_column" 형식, 없으면 null
    nullable: bool
    # 컬럼 DEFAULT 표현식(reflection 캡처). SET/DROP DEFAULT 롤백 시 이전 값 정확 복원용.
    # 없으면 null. UI 미표시(롤백 down_script 생성에만 사용) — camelCase 불필요.
    columnDefault: Optional[str] = None
    diff: DiffStatus
    change: Optional[ColumnChange] = None
    # 무결성 진단(read-only, metadata-only). 필드명은 TS 미러와 동일한 camelCase로 둬 alias 불필요.
    implicitFkHint: Optional[str] = None  # 추정 참조 테이블 id, 네이밍+타입 휴리스틱(estimated)
    highNullRatio: Optional[float] = None  # pg_stats null_frac(0~1), near-saturation일 때만
    brokenReferential: bool = False  # FK 값이 부모 PK에 없는 고아 값 존재(row-scan, n홉 한정)
    softDeletedParentRef: bool = False  # 부모가 soft-delete됨 — 논리적 broken이나 물리 행 존재(informational)


class TableNode(BaseModel):
    id: str  # "schema.table" 형식
    table: str
    diff: DiffStatus
    columns: list[ColumnNode]
    isOrphan: bool = False  # FK in/out 둘 다 없는 고립 테이블


class FkEdge(BaseModel):
    id: str
    source: str  # "schema.table"
    target: str
    sourceColumn: str
    targetColumn: str
    diff: DiffStatus
    isEstimated: bool = False  # 암묵 FK 추정 엣지(naming 휴리스틱, dotted 렌더)
    estimatedConfidence: Optional[Literal["high", "medium"]] = None  # 추정 신뢰도(엣지 톤 차등)


class SchemaGraph(BaseModel):
    nodes: list[TableNode]
    edges: list[FkEdge]
