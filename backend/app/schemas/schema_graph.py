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
    diff: DiffStatus
    change: Optional[ColumnChange] = None


class TableNode(BaseModel):
    id: str  # "schema.table" 형식
    table: str
    diff: DiffStatus
    columns: list[ColumnNode]


class FkEdge(BaseModel):
    id: str
    source: str  # "schema.table"
    target: str
    sourceColumn: str
    targetColumn: str
    diff: DiffStatus


class SchemaGraph(BaseModel):
    nodes: list[TableNode]
    edges: list[FkEdge]
