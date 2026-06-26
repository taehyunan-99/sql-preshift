"""Ollama OpenAI 호환 클라이언트 — ARCHITECTURE §4 llm/client.py."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


class OllamaError(Exception):
    """Ollama 호출 실패 또는 미기동 시 발생."""


async def complete(messages: list[dict[str, str]], *, temperature: float = 0.0) -> str:
    """OpenAI 호환 /v1/chat/completions (Ollama) 호출 → 텍스트 반환."""
    from app.settings_store import current_chat_model

    url = f"{settings.ollama_base_url}/v1/chat/completions"
    payload: dict[str, Any] = {
        # 모델 태그는 사용자 설정(영속) 우선, 없으면 config 기본.
        "model": current_chat_model(),
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except httpx.ConnectError as e:
        raise OllamaError(f"Ollama 연결 실패 ({settings.ollama_base_url}): {e}") from e
    except httpx.HTTPStatusError as e:
        raise OllamaError(f"Ollama HTTP 오류 {e.response.status_code}: {e.response.text}") from e
    except Exception as e:
        raise OllamaError(f"Ollama 호출 중 예외: {e}") from e


async def status() -> dict[str, Any]:
    """Ollama serve 도달 가능 여부 + 필수 모델(chat·embed) 존재를 확인한다.

    설치앱 NL 게이팅의 신호원 — ready=True여야 자연어 입력이 동작한다.
    serve 미기동/모델 부재를 구분해 안내 문구를 다르게 줄 수 있게 필드를 분리한다.
    호출은 가벼운 GET /api/tags 한 번(임베딩/추론 안 함)으로 끝낸다.
    """
    from app.settings_store import current_chat_model

    chat = current_chat_model()
    embed_model = settings.ollama_embed_model
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            tags = {m["name"] for m in resp.json().get("models", [])}
    except Exception:
        # serve 미기동/도달 불가 — reachable=False면 모델 존재 여부는 알 수 없다.
        return {"reachable": False, "chatModel": chat, "chatReady": False,
                "embedModel": embed_model, "embedReady": False, "ready": False,
                "available": []}
    chat_ready = chat in tags
    embed_ready = embed_model in tags
    return {"reachable": True, "chatModel": chat, "chatReady": chat_ready,
            "embedModel": embed_model, "embedReady": embed_ready,
            "ready": chat_ready and embed_ready,
            # 설치된 모델 목록 — 설정 UI의 드롭다운 후보(chat 모델 선택용).
            "available": sorted(tags)}


async def embed(text: str) -> list[float]:
    """Ollama /api/embeddings 호출 → 벡터 반환."""
    url = f"{settings.ollama_base_url}/api/embeddings"
    payload = {"model": settings.ollama_embed_model, "prompt": text}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["embedding"]
    except httpx.ConnectError as e:
        raise OllamaError(f"Ollama 연결 실패: {e}") from e
    except httpx.HTTPStatusError as e:
        raise OllamaError(f"Ollama 임베딩 HTTP 오류 {e.response.status_code}: {e.response.text}") from e
    except Exception as e:
        raise OllamaError(f"Ollama 임베딩 호출 중 예외: {e}") from e
