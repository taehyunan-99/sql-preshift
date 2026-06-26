from fastapi import APIRouter
from pydantic import BaseModel

from app.llm import client

router = APIRouter(prefix="/api/llm", tags=["llm"])


class LlmStatus(BaseModel):
    # Ollama serve 도달 여부와 필수 모델 존재를 분리 노출 — 프론트가 안내 문구를 분기한다.
    reachable: bool
    chatModel: str
    chatReady: bool
    embedModel: str
    embedReady: bool
    ready: bool


@router.get("/status", response_model=LlmStatus)
async def llm_status() -> LlmStatus:
    """NL 입력 게이팅 신호 — Ollama serve + 필수 모델(chat·embed) 가용 여부."""
    return LlmStatus(**await client.status())
