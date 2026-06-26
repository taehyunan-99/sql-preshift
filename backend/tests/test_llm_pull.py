"""LLM 모델 pull 스트림(client.pull_models) 단위 테스트.

Ollama HTTP를 직접 mock해 NDJSON 스트림 파싱·단계 라벨링·중복 스킵·에러 중단을
검증한다(실제 다운로드 없이). httpx.AsyncClient를 가짜로 갈아끼운다.
"""

from __future__ import annotations

import json

import pytest

from app.llm import client as llm_client


class _FakeStreamResponse:
    """httpx client.stream(...) 컨텍스트가 돌려주는 응답 흉내."""

    def __init__(self, lines: list[str]):
        self._lines = lines

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        for ln in self._lines:
            yield ln

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeTagsResponse:
    def __init__(self, names: list[str]):
        self._names = names

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return {"models": [{"name": n} for n in self._names]}


def _patch(monkeypatch, *, installed: list[str], pull_lines: dict[str, list[str]]):
    """tags 조회 결과(installed)와 태그별 pull NDJSON 라인을 주입한다."""

    class _FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url):
            return _FakeTagsResponse(installed)

        def stream(self, method, url, json=None):  # noqa: A002 - httpx 시그니처 모사
            tag = (json or {}).get("model")
            return _FakeStreamResponse(pull_lines.get(tag, []))

    monkeypatch.setattr(llm_client.httpx, "AsyncClient", _FakeAsyncClient)


async def _collect(agen) -> list[dict]:
    return [evt async for evt in agen]


@pytest.mark.asyncio
async def test_pull_both_when_nothing_installed(monkeypatch):
    # embed(bge-m3) 먼저, 그 다음 chat — 둘 다 미설치면 steps=2.
    _patch(
        monkeypatch,
        installed=[],
        pull_lines={
            "bge-m3:latest": [
                json.dumps({"status": "pulling manifest"}),
                json.dumps({"status": "pulling x", "total": 100, "completed": 50}),
                json.dumps({"status": "success"}),
            ],
            "qwen3:4b": [
                json.dumps({"status": "pulling manifest"}),
                json.dumps({"status": "success"}),
            ],
        },
    )
    events = await _collect(llm_client.pull_models("qwen3:4b"))
    # 첫 타깃은 embed, step 1/2.
    starts = [e for e in events if e.get("status") == "starting"]
    assert starts[0]["model"] == "bge-m3:latest"
    assert starts[0]["step"] == 1 and starts[0]["steps"] == 2
    assert starts[1]["model"] == "qwen3:4b"
    assert starts[1]["step"] == 2
    # 진행 이벤트에 model 라벨이 붙는다.
    prog = [e for e in events if "completed" in e]
    assert prog and prog[0]["model"] == "bge-m3:latest" and prog[0]["completed"] == 50
    # 마지막은 통합 완료.
    assert events[-1].get("done") is True


@pytest.mark.asyncio
async def test_skip_already_installed_embed(monkeypatch):
    # bge-m3가 이미 있으면 chat만 받는다 → steps=1.
    _patch(
        monkeypatch,
        installed=["bge-m3:latest"],
        pull_lines={
            "qwen3:4b": [json.dumps({"status": "success"})],
        },
    )
    events = await _collect(llm_client.pull_models("qwen3:4b"))
    starts = [e for e in events if e.get("status") == "starting"]
    assert len(starts) == 1
    assert starts[0]["model"] == "qwen3:4b" and starts[0]["steps"] == 1


@pytest.mark.asyncio
async def test_nothing_to_pull_when_all_installed(monkeypatch):
    _patch(monkeypatch, installed=["bge-m3:latest", "qwen3:4b"], pull_lines={})
    events = await _collect(llm_client.pull_models("qwen3:4b"))
    assert len(events) == 1 and events[0].get("done") is True


@pytest.mark.asyncio
async def test_error_stops_stream(monkeypatch):
    # embed pull 중 error가 오면 즉시 중단 — chat은 시작도 안 한다.
    _patch(
        monkeypatch,
        installed=[],
        pull_lines={
            "bge-m3:latest": [
                json.dumps({"status": "pulling manifest"}),
                json.dumps({"error": "file does not exist"}),
            ],
            "qwen3:4b": [json.dumps({"status": "success"})],
        },
    )
    events = await _collect(llm_client.pull_models("qwen3:4b"))
    assert any("error" in e for e in events)
    # chat(step 2) 시작 이벤트가 없어야 한다.
    assert not any(e.get("model") == "qwen3:4b" for e in events)
    # done 완료 이벤트도 없다.
    assert not any(e.get("done") for e in events)


@pytest.mark.asyncio
async def test_empty_tag_errors(monkeypatch):
    events = await _collect(llm_client.pull_models("   "))
    assert events == [{"error": "empty model tag"}]
