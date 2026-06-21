"""SQL → 자연어 설명 — ARCHITECTURE §4 explain.py."""

from __future__ import annotations

import re

from app.llm.client import OllamaError, complete

# 영/한 설명을 한 번의 LLM 호출로 동시 생성(분석 지연 2배 방지). EN:/KO: 구분자로 파싱.
_SYSTEM_PROMPT = """\
You are a database expert. Explain the given SQL statement concisely for non-developers.
Rules:
- Keep each explanation to 1-2 short sentences. Be terse.
- Do not repeat the SQL code.
- For schema changes, mention the impact (risk) in the same sentence if relevant.
- Do NOT use markdown (no **bold**, no headings, no bullet lists). Plain text only.
- Output exactly two lines in this format, nothing else:
EN: <English explanation>
KO: <Korean explanation>
"""


def _strip_markdown(text: str) -> str:
    """** 볼드, * 강조, 백틱, 머리글 기호 등 마크다운 제거 — 평문화."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)  # **bold**
    text = re.sub(r"\*(.+?)\*", r"\1", text)  # *italic*
    text = text.replace("`", "")
    text = re.sub(r"^\s*[#>\-\*]+\s*", "", text, flags=re.MULTILINE)  # 머리글/불릿 기호
    return text.strip()


def _parse_bilingual(raw: str) -> tuple[str, str]:
    """LLM 출력에서 EN:/KO: 두 줄을 파싱. 실패 시 전체를 영어로 폴백, 한국어는 빈 값."""
    en, ko = "", ""
    for line in raw.splitlines():
        s = line.strip()
        if s.upper().startswith("EN:"):
            en = s[3:].strip()
        elif s.upper().startswith("KO:"):
            ko = s[3:].strip()
    if not en:
        en = raw.strip()
    return _strip_markdown(en), _strip_markdown(ko)


async def explain_sql(sql: str) -> tuple[str, str]:
    """SQL을 영어·한국어로 설명한다. (en, ko) 튜플 반환. Ollama 미기동 시 폴백."""
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": f"Explain this SQL:\n{sql}"},
    ]
    try:
        raw = await complete(messages, temperature=0.0)
        return _parse_bilingual(raw)
    except OllamaError:
        return _fallback_explain(sql)


def _fallback_explain(sql: str) -> tuple[str, str]:
    """Ollama 미기동 시 SQL 유형 기반 간단 설명 (en, ko)."""
    first = sql.strip().split()[0].upper() if sql.strip() else ""
    mapping = {
        "SELECT": ("Reads data.", "데이터를 조회합니다."),
        "INSERT": ("Inserts new rows.", "새 행을 삽입합니다."),
        "UPDATE": ("Updates existing rows.", "기존 행을 업데이트합니다."),
        "DELETE": ("Deletes rows.", "행을 삭제합니다."),
        "CREATE": ("Creates a table or object.", "테이블 또는 객체를 생성합니다."),
        "ALTER": ("Alters table structure.", "테이블 구조를 변경합니다."),
        "DROP": ("Drops a table or object.", "테이블 또는 객체를 삭제합니다."),
        "TRUNCATE": ("Removes all rows from a table.", "테이블의 모든 행을 삭제합니다."),
    }
    return mapping.get(first, ("Executes SQL.", "SQL을 실행합니다."))
