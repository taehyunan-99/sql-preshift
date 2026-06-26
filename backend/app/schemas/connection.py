"""런타임 target DB 연결 DTO — 온보딩 폼/상태 계약.

프론트와 camelCase로 주고받되 내부는 snake_case(populate_by_name + alias).
password는 요청에만 있고 상태/응답엔 절대 싣지 않는다(자격증명 비노출).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ConnectionRequest(BaseModel):
    """연결/테스트 요청 — 분리 필드. password는 응답으로 되돌리지 않는다."""

    model_config = ConfigDict(populate_by_name=True)

    host: str
    port: int = 5432
    user: str
    password: str = ""
    dbname: str


class ConnectionStatus(BaseModel):
    """현재 연결 상태 — password 제외. epoch는 DB 교체 순번(캐시 무효화 신호)."""

    model_config = ConfigDict(populate_by_name=True)

    connected: bool
    host: Optional[str] = None
    port: Optional[int] = None
    dbname: Optional[str] = None
    epoch: int = 0


class ConnectionTestResult(BaseModel):
    """연결 테스트 결과 — 엔진 교체 없이 도달성만 확인. warnings는 SSRF 경고(차단 아님)."""

    model_config = ConfigDict(populate_by_name=True)

    success: bool
    message: str
    warnings: list[str] = Field(default_factory=list)
