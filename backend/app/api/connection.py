"""런타임 target DB 연결 온보딩 API.

엔드포인트:
- GET  /api/connection/status — 현재 연결 상태(password 제외)
- POST /api/connection/test   — 도달성만 확인(엔진 교체 없음) + SSRF 경고
- POST /api/connection        — 검증 후 target engine 교체(+ 캐시 무효화) + reindex

보안: connection_validation으로 dialect 고정·SSRF 경고·자격증명 마스킹.
감사로그엔 host/port/dbname만 — password는 절대 기록하지 않는다.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

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
async def connect(req: ConnectionRequest) -> ConnectionStatus:
    """검증 후 target engine을 교체한다. 교체 시 분석 토큰 캐시는 자동 무효화된다."""
    try:
        url = validate_url(build_url(req.host, req.port, req.user, req.password, req.dbname))
        test_connection(url)
    except ConnectionValidationError as e:
        raise HTTPException(status_code=422, detail=e.message)

    set_target_engine(url)
    # RAG 재색인은 응답을 막지 않는다 — 별도 스레드 fire-and-forget(메인 루프 무차단).
    _schedule_reindex()
    return _current_status()


# fire-and-forget reindex 태스크 강한 참조 보관 — create_task 결과를 안 잡으면 GC로 중도 취소될 수 있다.
_reindex_tasks: set[asyncio.Task[None]] = set()


def _schedule_reindex() -> None:
    """재색인을 메인 이벤트 루프와 분리된 스레드에서 fire-and-forget으로 돌린다.

    BackgroundTasks/메인 루프에서 직접 await하면 92청크 순차 임베딩 + 동기 DB write가
    단일 워커 이벤트 루프를 점유해 /status 등 모든 요청이 hang(→ 프론트 빈 화면)했다.
    별도 스레드에서 자체 이벤트 루프로 돌려 메인 루프를 전혀 막지 않는다.
    """

    async def _runner() -> None:
        try:
            await asyncio.to_thread(_reindex_blocking)
        except Exception:
            pass

    task = asyncio.create_task(_runner())
    _reindex_tasks.add(task)
    task.add_done_callback(_reindex_tasks.discard)


def _reindex_blocking() -> None:
    """스레드에서 실행 — 자체 이벤트 루프로 async reindex를 끝까지 돌린다(메인 루프 무관)."""
    try:
        from app.db import get_target_engine
        from app.pipeline.rag import reindex_schema

        asyncio.run(reindex_schema(get_target_engine()))
    except Exception:
        pass
