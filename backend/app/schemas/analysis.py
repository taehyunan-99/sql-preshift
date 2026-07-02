"""분석 파이프라인 DTO: Violation, Risk, SchemaSimResult, InputMode."""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

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
    message: str  # 영어 (UI 기본)
    message_ko: str = Field(default="", serialization_alias="messageKo")  # 한국어 (UI 토글용)
    # 이 위험이 영향을 주는 테이블명 — ERD 노드 강조용(프론트가 메시지 파싱 대신 이걸 씀).
    tables: list[str] = Field(default_factory=list)
    llm_note: Optional[str] = Field(default=None, serialization_alias="llmNote")
    llm_note_ko: Optional[str] = Field(default=None, serialization_alias="llmNoteKo")
    # golden path — "차단"이 아니라 "대신 이렇게 하라"는 actionable 안전 대안(현업 정석 패턴).
    # 단일 statement AST만 보는 도구의 정직한 포지션: 위험을 알리되 안전한 경로를 제시한다.
    suggestion: Optional[str] = Field(default=None)  # 영어 (UI 기본)
    suggestion_ko: Optional[str] = Field(
        default=None, serialization_alias="suggestionKo"
    )
    # size-aware — target DB의 reltuples/size를 read-only 조회해 추상적 위험을 구체화.
    # "Rewrites ~12M rows / 4 GB" 처럼 영향 규모를 숫자로 보여준다(락 보유 시간의 크기 의존성).
    size_note: Optional[str] = Field(default=None, serialization_alias="sizeNote")  # 영어
    size_note_ko: Optional[str] = Field(
        default=None, serialization_alias="sizeNoteKo"
    )


class SchemaSimResult(BaseModel):
    before: SchemaGraph
    after: SchemaGraph
    # 누적 dry-run 전용: 원본 실DB 대비 "스택 전체" 적용 결과(diff 마킹 포함).
    # Split뷰는 before/after(직전 1개)로 선명한 비교, Unified뷰는 이걸로 전체 누적 표시.
    # 누적이 아니면(단건) None — Unified도 after를 그대로 쓴다.
    cumulative_after: Optional[SchemaGraph] = Field(
        default=None, serialization_alias="cumulativeAfter"
    )


class DataSimResult(BaseModel):
    affectedRows: int
    estimatedRows: int
    # 제약 위반 사전 점검(read-only): ADD/SET NOT NULL 시 NULL인 기존 행 수.
    # None=점검 비대상(일반 DML), 0=위반 없음(안전), N>0=적용 시 N행이 위반.
    constraintViolations: Optional[int] = Field(default=None)
    constraintHint: Optional[str] = Field(default=None)  # "column \"x\" would reject N rows" 류 영어 힌트
    constraintHintKo: Optional[str] = Field(
        default=None, serialization_alias="constraintHintKo"
    )


# ─── analyze 요청/응답 DTO ──────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """#7: 프론트는 `input` 키로 전송한다. `sql` alias도 수용."""
    input: Optional[str] = None
    sql: Optional[str] = None  # 하위 호환 (직접 SQL 입력 경로)
    mode: InputMode = InputMode.AUTO
    # 누적 dry-run baseline: 직전까지 dry-run으로 쌓은 SQL(순서대로). 비면 기존 동작과 동일.
    priorSqls: list[str] = Field(default_factory=list)

    def get_raw_input(self) -> str:
        """input 또는 sql 중 있는 것을 반환한다."""
        return (self.input or self.sql or "").strip()


class AnalyzeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mode: str
    detectedConfidence: float
    sql: str
    explanation: str  # 영어 설명(기본)
    explanationKo: str = ""  # 한국어 설명(UI 토글용)
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
    model_config = ConfigDict(populate_by_name=True)

    token: str
    # critical 위험을 사용자가 명시적으로 확인하고 적용을 강행할 때 true.
    # 기본 false → critical은 422 차단(실수 방지). true → 경고는 했으니 적용은 사용자 판단.
    confirm_critical: bool = Field(default=False, alias="confirmCritical")


class ApplyResult(BaseModel):
    """#5: §5 계약 — auditId:str, appliedAt:str, sql:str."""
    auditId: str
    appliedAt: str
    sql: str


# ─── apply-all DTO (누적 dry-run 일괄 적용) ──────────────────────────

class ApplyAllRequest(BaseModel):
    """dry-run으로 쌓은 전체 SQL(순서대로) — 단일 TX로 일괄 적용한다."""
    model_config = ConfigDict(populate_by_name=True)

    sqls: list[str]
    # critical 위험 명시 확인 후 강행 시 true. 기본 false → critical 포함 시 422 차단.
    confirm_critical: bool = Field(default=False, alias="confirmCritical")


class ApplyAllResult(BaseModel):
    """SQL당 AuditLog 1건 → auditIds는 sqls 순서와 일치."""
    auditIds: list[str]
    appliedAt: str  # 마지막 커밋 시각 ISO
    count: int


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
