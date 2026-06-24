"""런타임 target DB 연결 온보딩 API.

엔드포인트:
- GET  /api/connection/status — 현재 연결 상태(password 제외)
- POST /api/connection/test   — 도달성만 확인(엔진 교체 없음) + SSRF 경고
- POST /api/connection        — 검증 후 target engine 교체(+ 캐시 무효화) + reindex
- POST /api/connection/sample — 기본 docker DB에 e커머스 샘플 시드 후 연결

보안: connection_validation으로 dialect 고정·SSRF 경고·자격증명 마스킹.
감사로그엔 host/port/dbname만 — password는 절대 기록하지 않는다.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.config import settings
from app.db import (
    clear_target_engine,
    get_connection_epoch,
    get_connection_meta,
    is_target_connected,
    set_target_engine,
)
from app.pipeline.connection_validation import (
    ConnectionValidationError,
    build_url,
    internal_network_warnings,
    test_connection,
    validate_url,
)
from app.schemas.connection import (
    ConnectionRequest,
    ConnectionStatus,
    ConnectionTestResult,
    SampleRequest,
)

router = APIRouter(prefix="/api/connection", tags=["connection"])


def _current_status() -> ConnectionStatus:
    meta = get_connection_meta()
    return ConnectionStatus(
        connected=is_target_connected(),
        host=meta["host"],
        port=meta["port"],
        dbname=meta["dbname"],
        epoch=get_connection_epoch(),
    )


@router.get("/status", response_model=ConnectionStatus)
async def connection_status() -> ConnectionStatus:
    """현재 target DB 연결 상태. 프론트 온보딩 게이트가 최초 로드 시 조회한다."""
    return _current_status()


@router.delete("", response_model=ConnectionStatus)
async def disconnect() -> ConnectionStatus:
    """target 연결을 해제하고 미연결 상태로 되돌린다 — 프론트 온보딩 로비로 복귀.

    슬롯만 비울 뿐 어떤 DB도 변경/삭제하지 않는다(read-only). 메타 DB도 무관.
    """
    clear_target_engine()
    return _current_status()


@router.post("/test", response_model=ConnectionTestResult)
async def connection_test(req: ConnectionRequest) -> ConnectionTestResult:
    """엔진을 교체하지 않고 도달성만 확인한다. 내부망이면 경고(차단 아님)."""
    try:
        url = validate_url(build_url(req.host, req.port, req.user, req.password, req.dbname))
        warnings = internal_network_warnings(req.host)
        test_connection(url)
    except ConnectionValidationError as e:
        # 검증/연결 실패 — 자격증명은 이미 마스킹됨
        return ConnectionTestResult(success=False, message=e.message)
    return ConnectionTestResult(
        success=True, message="Connection successful.", warnings=warnings
    )


@router.post("", response_model=ConnectionStatus)
async def connect(req: ConnectionRequest, background_tasks: BackgroundTasks) -> ConnectionStatus:
    """검증 후 target engine을 교체한다. 교체 시 분석 토큰 캐시는 자동 무효화된다."""
    try:
        url = validate_url(build_url(req.host, req.port, req.user, req.password, req.dbname))
        test_connection(url)
    except ConnectionValidationError as e:
        raise HTTPException(status_code=422, detail=e.message)

    set_target_engine(url)
    # RAG 재색인은 응답을 막지 않는다 — NL→SQL에서만 쓰이고 연결 직후 ERD엔 불필요(첫인상 대기 제거).
    background_tasks.add_task(_reindex_quietly)
    return _current_status()


@router.post("/sample", response_model=ConnectionStatus)
async def connect_sample(
    background_tasks: BackgroundTasks, req: SampleRequest | None = None
) -> ConnectionStatus:
    """기본 docker DB에 샘플을 시드한 뒤 연결한다(클릭 한 번 체험용).

    kind: ecommerce(9테이블, 기본) / erp(92테이블). body 미전송 시 ecommerce(기존 호환).
    """
    kind = req.kind if req else "ecommerce"
    url = settings.target_database_url
    if not url:
        raise HTTPException(
            status_code=503,
            detail="No sample database is configured.",
        )
    try:
        validated = validate_url(url)
        test_connection(validated)
        # 샘플 스키마 시드(드롭 후 재생성) — 함수만 호출(스크립트 부작용 없음).
        # 두 시드 모두 seed(target_engine) 시그니처 동일.
        from sqlalchemy import create_engine

        if kind == "erp":
            from migrations.seed_erp import seed
        else:
            from migrations.seed_ecommerce import seed

        seed_engine = create_engine(validated, connect_args={"connect_timeout": 5})
        try:
            seed(seed_engine)
        finally:
            seed_engine.dispose()
    except ConnectionValidationError as e:
        raise HTTPException(status_code=503, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to seed sample database: {e}")

    set_target_engine(validated)
    # 재색인은 백그라운드 — 시드 직후 ERD가 즉시 뜨고 색인은 뒤에서 끝난다.
    background_tasks.add_task(_reindex_quietly)
    return _current_status()


async def _reindex_quietly() -> None:
    """연결 직후 RAG 재색인 — 실패해도(Ollama 미기동 등) 연결 결과엔 영향 없음."""
    try:
        from app.db import get_target_engine
        from app.pipeline.rag import reindex_schema

        await reindex_schema(get_target_engine())
    except Exception:
        pass
