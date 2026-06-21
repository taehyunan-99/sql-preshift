"""분석 파이프라인 DTO: Violation, Risk, SchemaSimResult, InputMode."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_serializer

from app.schemas.schema_graph import SchemaGraph


class InputMode(str, Enum):
    NL = "nl"
    SQL = "sql"
    AUTO = "auto"


class Violation(BaseModel):
    rule: str
    message: str


class Risk(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    level: Literal["critical", "warning", "info"]
    rule: str
    message: str
    llm_note: Optional[str] = Field(default=None, serialization_alias="llmNote")


class SchemaSimResult(BaseModel):
    before: SchemaGraph
    after: SchemaGraph


class DataSimResult(BaseModel):
    affectedRows: int
    estimatedRows: int


# ─── analyze 요청/응답 DTO ──────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """#7: 프론트는 `input` 키로 전송한다. `sql` alias도 수용."""
    input: Optional[str] = None
    sql: Optional[str] = None  # 하위 호환 (직접 SQL 입력 경로)
    mode: InputMode = InputMode.AUTO

    def get_raw_input(self) -> str:
        """input 또는 sql 중 있는 것을 반환한다."""
        return (self.input or self.sql or "").strip()


class AnalyzeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mode: str
    detectedConfidence: float
    sql: str
    explanation: str
    valid: bool
    violations: list[str]  # #4: message 문자열 배열
    schemaDiff: Optional[SchemaSimResult] = None
    dataSim: Optional[DataSimResult] = None
    risks: list[Risk]
    hasCritical: bool = False  # #1: risks 파생 boolean
    downScript: Optional[str] = None
    token: str  # /api/apply가 재검증에 사용


# ─── apply DTO ───────────────────────────────────────────────────────

class ApplyRequest(BaseModel):
    token: str


class ApplyResult(BaseModel):
    """#5: §5 계약 — auditId:str, appliedAt:str, sql:str."""
    auditId: str
    appliedAt: str
    sql: str


# ─── audit DTO ───────────────────────────────────────────────────────

class AuditEntry(BaseModel):
    """#6: §5 계약 — id:str, sql:str, appliedAt:str, rolledBack:bool."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    sql: str
    appliedAt: str
    rolledBack: bool


class RollbackResult(BaseModel):
    """§5 계약 — auditId:str, rolledBackAt:str."""
    auditId: str
    rolledBackAt: str
