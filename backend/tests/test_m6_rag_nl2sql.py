"""M6 RAG + NL→SQL + explain 테스트."""

from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ─── app.db 를 import 시점에 mock (psycopg 없는 환경) ───────────────────
_mock_db = ModuleType("app.db")
_mock_db.meta_engine = MagicMock()
_mock_db.target_engine = MagicMock()
_mock_db.get_meta_session = MagicMock()
_mock_db.ensure_vector_extension = MagicMock()
sys.modules.setdefault("app.db", _mock_db)

from app.pipeline.explain import _fallback_explain, explain_sql  # noqa: E402
from app.pipeline.nl2sql import SqlDraft, _extract_sql, generate_sql  # noqa: E402
from app.pipeline.rag import SchemaChunk, _fallback_retrieve, _reflect_chunks  # noqa: E402


# ─── SchemaChunk 유닛 ───────────────────────────────────────────────────

def test_schema_chunk_fields():
    chunk = SchemaChunk(table="users", kind="ddl", content="CREATE TABLE users (...)")
    assert chunk.table == "users"
    assert chunk.kind == "ddl"


# ─── _extract_sql ───────────────────────────────────────────────────────

def test_extract_sql_plain():
    raw = "ALTER TABLE users ADD COLUMN age integer;"
    assert _extract_sql(raw) == "ALTER TABLE users ADD COLUMN age integer;"


def test_extract_sql_strips_markdown_codeblock():
    raw = "```sql\nALTER TABLE users ADD COLUMN age integer;\n```"
    result = _extract_sql(raw)
    assert "ALTER TABLE" in result
    assert "```" not in result


def test_extract_sql_strips_comment_lines():
    raw = "-- 이 쿼리는 컬럼을 추가합니다\nALTER TABLE users ADD COLUMN age integer;"
    result = _extract_sql(raw)
    assert "--" not in result
    assert "ALTER TABLE" in result


# ─── _fallback_explain ──────────────────────────────────────────────────

def test_fallback_explain_alter():
    en, ko = _fallback_explain("ALTER TABLE users ADD COLUMN age int")
    assert "Alter" in en and "변경" in ko


def test_fallback_explain_drop():
    en, ko = _fallback_explain("DROP TABLE users")
    assert "Drop" in en and "삭제" in ko


def test_fallback_explain_select():
    en, ko = _fallback_explain("SELECT * FROM users")
    assert "Reads" in en and "조회" in ko


def test_fallback_explain_unknown():
    en, ko = _fallback_explain("")
    assert isinstance(en, str) and isinstance(ko, str)


# ─── explain_sql (mock Ollama) ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_explain_sql_ollama_success():
    raw = "EN: Adds an age column to users.\nKO: users 테이블에 age 컬럼을 추가합니다."
    with patch("app.pipeline.explain.complete", new=AsyncMock(return_value=raw)):
        en, ko = await explain_sql("ALTER TABLE users ADD COLUMN age int")
    assert "age column" in en and "age 컬럼" in ko


@pytest.mark.asyncio
async def test_explain_sql_markdown_stripped():
    # ** 볼드 등 마크다운이 평문화되는지
    raw = "EN: This **alters** the table.\nKO: 테이블을 **변경**합니다."
    with patch("app.pipeline.explain.complete", new=AsyncMock(return_value=raw)):
        en, ko = await explain_sql("ALTER TABLE users ADD COLUMN age int")
    assert "**" not in en and "**" not in ko
    assert "alters" in en


@pytest.mark.asyncio
async def test_explain_sql_ollama_unavailable_fallback():
    from app.llm.client import OllamaError
    with patch("app.pipeline.explain.complete", new=AsyncMock(side_effect=OllamaError("연결 실패"))):
        en, ko = await explain_sql("ALTER TABLE users ADD COLUMN age int")
    assert len(en) > 0 and len(ko) > 0


# ─── generate_sql (mock Ollama) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_sql_returns_sql_draft():
    chunks = [
        SchemaChunk(table="users", kind="ddl", content="CREATE TABLE users (id integer PRIMARY KEY, name text)"),
    ]
    llm_output = "ALTER TABLE users ADD COLUMN age integer;"
    with patch("app.pipeline.nl2sql.complete", new=AsyncMock(return_value=llm_output)):
        draft = await generate_sql("users 테이블에 age 컬럼 추가", chunks)
    assert isinstance(draft, SqlDraft)
    assert "ALTER TABLE" in draft.sql


@pytest.mark.asyncio
async def test_generate_sql_selfcorrect_on_empty():
    """LLM이 빈 응답 → 1회 재시도."""
    chunks = [SchemaChunk(table="users", kind="ddl", content="CREATE TABLE users (id int)")]
    call_count = 0

    async def fake_complete(messages, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return ""
        return "ALTER TABLE users ADD COLUMN age integer;"

    with patch("app.pipeline.nl2sql.complete", new=fake_complete):
        draft = await generate_sql("age 추가", chunks)

    assert call_count == 2
    assert "ALTER" in draft.sql


# ─── NL→SQL → validation 통과 강제 검증 ────────────────────────────────

@pytest.mark.asyncio
async def test_generated_sql_passes_validation():
    """generate_sql 출력이 M2 validation.parse + check_forbidden을 통과해야 한다."""
    from app.pipeline.validation import check_forbidden, parse

    chunks = [SchemaChunk(table="users", kind="ddl", content="CREATE TABLE users (id int PRIMARY KEY)")]
    llm_output = "ALTER TABLE users ADD COLUMN age integer;"

    with patch("app.pipeline.nl2sql.complete", new=AsyncMock(return_value=llm_output)):
        draft = await generate_sql("age 컬럼 추가", chunks)

    ast = parse(draft.sql)
    violations = check_forbidden(ast)
    assert len(violations) == 0, f"생성된 SQL이 validation을 통과하지 못함: {violations}"


@pytest.mark.asyncio
async def test_generated_dangerous_sql_caught_by_validation():
    """LLM이 멀티스테이트먼트 위험 SQL을 생성해도 validation이 잡아낸다."""
    from app.pipeline.validation import ValidationError, parse

    chunks = [SchemaChunk(table="users", kind="ddl", content="CREATE TABLE users (id int)")]
    llm_output = "SELECT 1; DROP TABLE users;"

    with patch("app.pipeline.nl2sql.complete", new=AsyncMock(return_value=llm_output)):
        draft = await generate_sql("위험한 요청", chunks)

    with pytest.raises(ValidationError):
        parse(draft.sql)


# ─── _reflect_chunks (mock engine) ─────────────────────────────────────

def test_reflect_chunks_basic():
    mock_engine = MagicMock()
    mock_insp = MagicMock()

    mock_insp.get_table_names.return_value = ["users"]
    mock_insp.get_columns.return_value = [
        {"name": "id", "type": "INTEGER", "nullable": False},
        {"name": "name", "type": "TEXT", "nullable": True},
    ]
    mock_insp.get_pk_constraint.return_value = {"constrained_columns": ["id"]}
    mock_insp.get_foreign_keys.return_value = []

    with patch("app.pipeline.rag.inspect", return_value=mock_insp):
        chunks = _reflect_chunks(mock_engine)

    assert any(c.kind == "ddl" for c in chunks)
    assert any(c.kind == "desc" for c in chunks)
    assert all(c.table == "users" for c in chunks)


# ─── reindex_schema (mock) ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reindex_schema_returns_count():
    """reindex_schema가 처리 청크 수를 반환한다 (DB·Ollama 모두 mock)."""
    from app.pipeline.rag import reindex_schema

    mock_engine = MagicMock()
    mock_insp = MagicMock()
    mock_insp.get_table_names.return_value = ["users"]
    mock_insp.get_columns.return_value = [{"name": "id", "type": "INTEGER", "nullable": False}]
    mock_insp.get_pk_constraint.return_value = {"constrained_columns": ["id"]}
    mock_insp.get_foreign_keys.return_value = []

    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchone.return_value = None

    mock_meta = MagicMock()
    mock_meta.begin.return_value = mock_conn

    with patch("app.pipeline.rag.inspect", return_value=mock_insp), \
         patch("app.pipeline.rag.embed", new=AsyncMock(return_value=[0.1] * 768)), \
         patch("app.pipeline.rag.meta_engine", mock_meta):
        count = await reindex_schema(mock_engine)

    assert count == 2  # ddl + desc 청크 = 2


# ─── retrieve fallback ──────────────────────────────────────────────────

def test_fallback_retrieve_returns_list():
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.execute.return_value.fetchall.return_value = [
        ("users", "ddl", "CREATE TABLE users (id int)"),
    ]
    mock_meta = MagicMock()
    mock_meta.connect.return_value = mock_conn

    with patch("app.pipeline.rag.meta_engine", mock_meta):
        results = _fallback_retrieve("users", k=3)

    assert len(results) == 1
    assert results[0].table == "users"
