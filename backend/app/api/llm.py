import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.llm import client
from app.settings_store import current_chat_model, set_chat_model

router = APIRouter(prefix="/api/llm", tags=["llm"])


class LlmStatus(BaseModel):
    # Ollama serve 도달 여부와 필수 모델 존재를 분리 노출 — 프론트가 안내 문구를 분기한다.
    reachable: bool
    chatModel: str
    chatReady: bool
    embedModel: str
    embedReady: bool
    ready: bool
    available: list[str]  # 설치된 모델 태그 — 설정 UI 드롭다운 후보


class LlmConfig(BaseModel):
    chatModel: str


class PullRequest(BaseModel):
    chatModel: str  # 받을 chat 모델 태그 — bge-m3는 미설치 시 자동 동반


@router.get("/status", response_model=LlmStatus)
async def llm_status() -> LlmStatus:
    """NL 입력 게이팅 신호 — Ollama serve + 필수 모델(chat·embed) 가용 여부."""
    return LlmStatus(**await client.status())


@router.get("/config", response_model=LlmConfig)
async def get_config() -> LlmConfig:
    """현재 NL→SQL chat 모델 태그(설정값 우선, 없으면 config 기본)."""
    return LlmConfig(chatModel=current_chat_model())


@router.put("/config", response_model=LlmConfig)
async def put_config(cfg: LlmConfig) -> LlmConfig:
    """chat 모델 태그를 영속한다. 임베딩 모델은 RAG 일관성상 고정이라 대상 아님."""
    set_chat_model(cfg.chatModel.strip())
    return LlmConfig(chatModel=current_chat_model())


@router.post("/pull")
async def pull(req: PullRequest) -> StreamingResponse:
    """chat 모델(+ 미설치면 bge-m3)을 앱 안에서 받는 SSE 진행 스트림.

    프론트는 EventSource 대신 fetch+ReadableStream으로 읽는다(POST라서).
    각 이벤트 data는 client.pull_models가 흘리는 dict의 JSON 직렬화 —
    {model, step, steps, status, total?, completed?, error?, done?}.
    """

    async def event_stream():
        async for evt in client.pull_models(req.chatModel):
            yield f"data: {json.dumps(evt)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        # 프록시/버퍼링이 진행률을 묶지 않도록.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
