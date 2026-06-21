"""결정적 위험 룰 — ADR-006."""

from __future__ import annotations

from typing import Optional

import sqlglot.expressions as exp

from app.llm.client import OllamaError, complete
from app.schemas.analysis import Risk

_RISK_EXPLAIN_SYSTEM = """\
너는 데이터베이스 보안 전문가다. 주어진 SQL과 위험 목록을 보고, 각 위험이 왜 문제인지·어떤 영향이 있는지·어떤 대안이 있는지를 한국어로 간결하게 설명한다.
규칙:
- 결정적 위험 판단(critical/warning)은 바꾸지 않는다. 해설만 추가한다.
- 전체 2~5문장 이내.
- SQL 코드를 그대로 반복하지 않는다.
"""


async def llm_explain_risk(
    sql: str,
    risks: list[Risk],
    schema_diff=None,
) -> str:
    """결정적 위험 목록 위에 LLM 자연어 해설을 생성한다. Ollama 미기동 시 폴백."""
    if not risks:
        return ""

    risk_summary = "\n".join(
        f"- [{r.level.upper()}] {r.rule}: {r.message}" for r in risks
    )
    messages = [
        {"role": "system", "content": _RISK_EXPLAIN_SYSTEM},
        {
            "role": "user",
            "content": (
                f"SQL:\n{sql}\n\n"
                f"감지된 위험:\n{risk_summary}\n\n"
                "위 위험들을 비개발자도 이해할 수 있게 해설해줘."
            ),
        },
    ]
    try:
        return await complete(messages, temperature=0.0)
    except OllamaError:
        return _fallback_risk_note(risks)


def deterministic_rules(
    ast: exp.Expression,
    data_sim=None,
) -> list[Risk]:
    """AST를 분석해 결정적 위험 룰 목록을 반환한다.

    Rules:
    - WHERE 없는 DELETE/UPDATE → critical
    - DROP TABLE → critical
    - DROP COLUMN → critical
    - TRUNCATE → critical
    - CASCADE 절 포함 → warning
    - NOT NULL 컬럼 추가(DEFAULT 없음) → warning
    """
    risks: list[Risk] = []

    # WHERE 없는 DELETE
    for delete in ast.find_all(exp.Delete):
        if not delete.args.get("where"):
            risks.append(
                Risk(
                    level="critical",
                    rule="DELETE_WITHOUT_WHERE",
                    message="WHERE 없는 DELETE — 테이블 전체 행이 삭제됩니다.",
                )
            )

    # WHERE 없는 UPDATE
    for update in ast.find_all(exp.Update):
        if not update.args.get("where"):
            risks.append(
                Risk(
                    level="critical",
                    rule="UPDATE_WITHOUT_WHERE",
                    message="WHERE 없는 UPDATE — 테이블 전체 행이 변경됩니다.",
                )
            )

    # DROP TABLE (최상위 Drop 또는 Alter 내부)
    for drop in ast.find_all(exp.Drop):
        kind = str(drop.args.get("kind", "")).upper()
        if kind == "TABLE":
            risks.append(
                Risk(
                    level="critical",
                    rule="DROP_TABLE",
                    message="DROP TABLE — 테이블과 모든 데이터가 영구 삭제됩니다.",
                )
            )

    # TRUNCATE
    for _ in ast.find_all(exp.TruncateTable):
        risks.append(
            Risk(
                level="critical",
                rule="TRUNCATE",
                message="TRUNCATE — 테이블의 모든 행을 빠르게 삭제합니다.",
            )
        )

    # ALTER TABLE 내 DROP COLUMN / ADD NOT NULL
    for alter in ast.find_all(exp.Alter):
        if str(alter.args.get("kind", "")).upper() != "TABLE":
            continue
        for action in alter.args.get("actions", []):
            # DROP COLUMN
            if isinstance(action, exp.Drop):
                col_kind = str(action.args.get("kind", "")).upper()
                if col_kind == "COLUMN":
                    risks.append(
                        Risk(
                            level="critical",
                            rule="DROP_COLUMN",
                            message="DROP COLUMN — 컬럼과 해당 데이터가 영구 삭제됩니다.",
                        )
                    )

            # ADD COLUMN NOT NULL without DEFAULT
            elif isinstance(action, exp.ColumnDef):
                constraints = action.args.get("constraints", [])
                has_not_null = any(
                    isinstance(c.args.get("kind"), exp.NotNullColumnConstraint)
                    for c in constraints
                    if isinstance(c, exp.ColumnConstraint)
                )
                has_default = any(
                    isinstance(c.args.get("kind"), exp.DefaultColumnConstraint)
                    for c in constraints
                    if isinstance(c, exp.ColumnConstraint)
                )
                if has_not_null and not has_default:
                    risks.append(
                        Risk(
                            level="warning",
                            rule="ADD_NOT_NULL_NO_DEFAULT",
                            message="DEFAULT 없는 NOT NULL 컬럼 추가 — 기존 행에서 오류가 발생할 수 있습니다.",
                        )
                    )

    # CASCADE — Drop.args["cascade"] 또는 Alter.args["cascade"]
    cascade_found = any(
        node.args.get("cascade")
        for node in ast.find_all((exp.Drop, exp.Alter))
    )
    if cascade_found:
        risks.append(
            Risk(
                level="warning",
                rule="CASCADE",
                message="CASCADE — 연쇄 삭제/변경이 발생할 수 있습니다.",
            )
        )

    return risks


def _fallback_risk_note(risks: list[Risk]) -> str:
    """Ollama 미기동 시 위험 목록 기반 간단 폴백 해설."""
    critical = [r for r in risks if r.level == "critical"]
    warnings = [r for r in risks if r.level == "warning"]
    parts: list[str] = []
    if critical:
        parts.append(f"치명적 위험 {len(critical)}건이 감지되었습니다: " + ", ".join(r.rule for r in critical) + ".")
    if warnings:
        parts.append(f"경고 {len(warnings)}건이 감지되었습니다: " + ", ".join(r.rule for r in warnings) + ".")
    parts.append("자세한 해설은 Ollama 서비스가 기동된 후 다시 시도하세요.")
    return " ".join(parts)
