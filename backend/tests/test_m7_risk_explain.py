"""M7 위험 해설 테스트 — llm_explain_risk 호출·폴백 검증."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.llm.client import OllamaError
from app.pipeline.risk import _fallback_risk_note, deterministic_rules, llm_explain_risk
from app.schemas.analysis import Risk


@pytest.fixture
def drop_table_risks():
    return [Risk(level="critical", rule="DROP_TABLE", message="테이블 삭제")]


@pytest.fixture
def mixed_risks():
    return [
        Risk(level="critical", rule="DROP_TABLE", message="테이블 삭제"),
        Risk(level="warning", rule="CASCADE", message="CASCADE 삭제"),
    ]


# ──── llm_explain_risk 정상 경로 ────────────────────────────────────────


@pytest.mark.asyncio
async def test_llm_explain_risk_calls_complete(drop_table_risks):
    """Ollama 응답이 있을 때 LLM 해설 문자열 반환."""
    expected = "DROP TABLE은 테이블과 모든 데이터를 영구 삭제합니다."
    with patch("app.pipeline.risk.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = expected
        result = await llm_explain_risk("DROP TABLE users", drop_table_risks)
    assert result == expected
    mock_complete.assert_called_once()


@pytest.mark.asyncio
async def test_llm_explain_risk_empty_risks():
    """위험 목록이 비어 있으면 빈 문자열 반환 (LLM 호출 없음)."""
    with patch("app.pipeline.risk.complete", new_callable=AsyncMock) as mock_complete:
        result = await llm_explain_risk("SELECT 1", [])
    assert result == ""
    mock_complete.assert_not_called()


# ──── 폴백 경로 ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_llm_explain_risk_fallback_on_ollama_error(drop_table_risks):
    """OllamaError 발생 시 폴백 해설 반환 (예외 전파 없음)."""
    with patch("app.pipeline.risk.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.side_effect = OllamaError("연결 실패")
        result = await llm_explain_risk("DROP TABLE users", drop_table_risks)
    assert isinstance(result, str)
    assert len(result) > 0
    assert "DROP_TABLE" in result


@pytest.mark.asyncio
async def test_llm_explain_risk_fallback_mixed(mixed_risks):
    """폴백에 critical·warning 개수 모두 포함."""
    with patch("app.pipeline.risk.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.side_effect = OllamaError("미기동")
        result = await llm_explain_risk("DROP TABLE users CASCADE", mixed_risks)
    assert "1건" in result or "DROP_TABLE" in result
    assert "CASCADE" in result


# ──── _fallback_risk_note 단위 테스트 ───────────────────────────────────


def test_fallback_note_critical_only():
    risks = [Risk(level="critical", rule="TRUNCATE", message="전체 삭제")]
    note = _fallback_risk_note(risks)
    assert "TRUNCATE" in note
    assert "치명적 위험" in note


def test_fallback_note_warning_only():
    risks = [Risk(level="warning", rule="ADD_NOT_NULL_NO_DEFAULT", message="NOT NULL 경고")]
    note = _fallback_risk_note(risks)
    assert "경고" in note
    assert "ADD_NOT_NULL_NO_DEFAULT" in note


def test_fallback_note_empty():
    note = _fallback_risk_note([])
    assert "Ollama" in note


# ──── 결정적 판단 불변 검증 ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_deterministic_rules_unchanged_after_llm(drop_table_risks):
    """llm_explain_risk가 결정적 위험 level·rule을 바꾸지 않는다."""
    import sqlglot
    ast = sqlglot.parse_one("DROP TABLE users", dialect="postgres")
    risks = deterministic_rules(ast)
    original_levels = [(r.level, r.rule) for r in risks]

    with patch("app.pipeline.risk.complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = "해설 텍스트"
        await llm_explain_risk("DROP TABLE users", risks)

    # 원본 리스트 불변
    assert [(r.level, r.rule) for r in risks] == original_levels
    critical = [r for r in risks if r.level == "critical" and r.rule == "DROP_TABLE"]
    assert len(critical) == 1
