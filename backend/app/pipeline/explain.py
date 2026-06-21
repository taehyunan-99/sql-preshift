"""SQL → 자연어 설명 — ARCHITECTURE §4 explain.py."""

from __future__ import annotations

from app.llm.client import OllamaError, complete

_SYSTEM_PROMPT = """\
너는 데이터베이스 전문가다. 주어진 SQL 문장을 비개발자도 이해할 수 있는 한국어로 간결하게 설명한다.
규칙:
- 2~4문장 이내로 설명한다.
- SQL 코드를 그대로 반복하지 않는다.
- 스키마 변경의 경우 영향(위험)을 한 문장으로 언급한다.
"""


async def explain_sql(sql: str) -> str:
    """SQL을 자연어로 설명한다. Ollama 미기동 시 간단한 폴백 설명을 반환한다."""
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": f"다음 SQL을 설명해줘:\n{sql}"},
    ]
    try:
        return await complete(messages, temperature=0.0)
    except OllamaError:
        return _fallback_explain(sql)


def _fallback_explain(sql: str) -> str:
    """Ollama 미기동 시 SQL 유형 기반 간단 설명."""
    first = sql.strip().split()[0].upper() if sql.strip() else ""
    mapping = {
        "SELECT": "데이터를 조회합니다.",
        "INSERT": "새 행을 삽입합니다.",
        "UPDATE": "기존 행을 업데이트합니다.",
        "DELETE": "행을 삭제합니다.",
        "CREATE": "테이블 또는 객체를 생성합니다.",
        "ALTER": "테이블 구조를 변경합니다.",
        "DROP": "테이블 또는 객체를 삭제합니다.",
        "TRUNCATE": "테이블의 모든 행을 삭제합니다.",
    }
    return mapping.get(first, "SQL을 실행합니다.")
