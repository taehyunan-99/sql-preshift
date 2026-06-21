"""Ollama OpenAI 호환 클라이언트 — ARCHITECTURE §4 llm/client.py."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


class OllamaError(Exception):
    """Ollama 호출 실패 또는 미기동 시 발생."""


async def complete(messages: list[dict[str, str]], *, temperature: float = 0.0) -> str:
    """OpenAI 호환 /v1/chat/completions (Ollama) 호출 → 텍스트 반환."""
    url = f"{settings.ollama_base_url}/v1/chat/completions"
    payload: dict[str, Any] = {
        "model": settings.ollama_model,
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
