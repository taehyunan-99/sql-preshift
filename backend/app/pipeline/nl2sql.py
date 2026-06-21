"""NL→SQL 초안 생성 — ARCHITECTURE §4 nl2sql.py."""

from __future__ import annotations

from pydantic import BaseModel

from app.llm.client import OllamaError, complete
from app.pipeline.rag import SchemaChunk


class SqlDraft(BaseModel):
    sql: str
    raw_llm_output: str


_SYSTEM_PROMPT = """\
너는 PostgreSQL 전문가다. 사용자의 자연어 요청을 받아 올바른 PostgreSQL DDL/DML SQL 한 문장만 출력한다.
규칙:
- SQL 문장 하나만 출력한다. 설명, 주석, 마크다운 코드블록 없이 순수 SQL만.
- 반드시 유효한 PostgreSQL 문법을 사용한다.
- 스키마 정보에 없는 테이블/컬럼은 임의로 만들지 않는다.
"""


def _build_prompt(nl_text: str, retrieved: list[SchemaChunk]) -> str:
    schema_ctx = "\n\n".join(c.content for c in retrieved)
    return f"""아래는 현재 데이터베이스 스키마 정보다:

{schema_ctx}

---
사용자 요청: {nl_text}

위 스키마를 참고해 요청을 수행하는 PostgreSQL SQL 문장 하나만 출력하라."""


def _extract_sql(raw: str) -> str:
    """LLM 출력에서 SQL만 추출 — 마크다운 코드블록 제거."""
    lines = raw.strip().splitlines()
    result = []
    in_block = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_block = not in_block
            continue
        if not in_block and stripped.startswith("--"):
            continue
        result.append(line)
    return "\n".join(result).strip()


async def generate_sql(nl_text: str, retrieved: list[SchemaChunk]) -> SqlDraft:
    """top-k 스키마 주입 프롬프트로 Ollama 호출 → SQL 초안 반환.

    ★ 보안: 출력 SQL은 호출부에서 반드시 validation.parse + check_forbidden을 통과시켜야 한다.
       LLM은 초안 생성만 담당하며 안전 판단은 결정적 코드가 수행한다.
    """
    prompt = _build_prompt(nl_text, retrieved)
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    raw = await complete(messages, temperature=0.0)
    sql_draft = _extract_sql(raw)

    # self-correct: SQL이 비어있으면 1회 재시도
    if not sql_draft:
        retry_messages = messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": "SQL 문장만 다시 출력하라. 설명 없이 SQL만."},
        ]
        raw = await complete(retry_messages, temperature=0.0)
        sql_draft = _extract_sql(raw)

    return SqlDraft(sql=sql_draft, raw_llm_output=raw)
