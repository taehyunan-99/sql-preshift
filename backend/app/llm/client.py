"""Ollama OpenAI 호환 클라이언트 — ARCHITECTURE §4 llm/client.py."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
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


async def _pull_one(client: httpx.AsyncClient, tag: str) -> AsyncIterator[dict[str, Any]]:
    """Ollama POST /api/pull(stream)을 NDJSON으로 받아 라인별 dict로 흘린다.

    각 라인은 {"status": ...} 또는 레이어 진행 {"status","total","completed"},
    실패 시 {"error": ...}. 호출부가 모델 라벨을 붙여 SSE로 중계한다.
    """
    url = f"{settings.ollama_base_url}/api/pull"
    async with client.stream("POST", url, json={"model": tag, "stream": True}) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                # 깨진 라인은 건너뛴다 — 다음 유효 이벤트로 진행률은 회복된다.
                continue


async def pull_models(chat_tag: str) -> AsyncIterator[dict[str, Any]]:
    """chat 모델 + 필수 임베딩(bge-m3)을 받는 통합 진행 스트림.

    "모델 하나 받기"가 NL에 필요한 두 모델(chat + embed)을 모두 보장하도록,
    이미 설치된 건 건너뛰고 없는 것만 순서대로 pull한다. 각 이벤트에 model 라벨과
    전체 단계(step/steps)를 실어 프론트가 "1 of 2" 진행을 그릴 수 있게 한다.
    """
    chat_tag = chat_tag.strip()
    embed_tag = settings.ollama_embed_model
    if not chat_tag:
        yield {"error": "empty model tag"}
        return

    # 이미 설치된 태그는 다시 받지 않는다(중복 방지).
    try:
        async with httpx.AsyncClient(timeout=3.0) as probe:
            resp = await probe.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            installed = {m["name"] for m in resp.json().get("models", [])}
    except Exception:
        installed = set()

    # embed를 먼저(보통 더 작음) — 둘 다 미설치면 step 1=embed, step 2=chat.
    targets = [t for t in (embed_tag, chat_tag) if t not in installed]
    if not targets:
        yield {"status": "success", "done": True}
        return

    steps = len(targets)
    # pull은 길 수 있어 넉넉한 타임아웃(읽기 무제한, 연결만 제한).
    timeout = httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for idx, tag in enumerate(targets, start=1):
            yield {"model": tag, "step": idx, "steps": steps, "status": "starting"}
            try:
                async for evt in _pull_one(client, tag):
                    yield {"model": tag, "step": idx, "steps": steps, **evt}
                    if "error" in evt:
                        return  # 실패하면 즉시 중단(다음 모델 받지 않음)
            except httpx.HTTPStatusError as e:
                yield {"model": tag, "step": idx, "steps": steps,
                       "error": f"pull failed (HTTP {e.response.status_code})"}
                return
            except Exception as e:
                yield {"model": tag, "step": idx, "steps": steps,
                       "error": f"pull failed: {e}"}
                return
    yield {"status": "success", "done": True}


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
