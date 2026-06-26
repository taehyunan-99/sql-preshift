from fastapi import APIRouter
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
