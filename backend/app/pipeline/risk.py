"""결정적 위험 룰 — ADR-006."""

from __future__ import annotations

from typing import Optional

import sqlglot.expressions as exp

from app.llm.client import OllamaError, complete
from app.pipeline.explain import _parse_bilingual
from app.schemas.analysis import Risk

# 영/한 해설을 한 번의 호출로 동시 생성(EN:/KO:). explain.py와 동일한 파서·마크다운 제거 사용.
_RISK_EXPLAIN_SYSTEM = """\
You are a database security expert. Given a SQL statement and detected risks, explain why each risk matters and its impact, concisely.
Rules:
- Do NOT change the risk verdict (critical/warning). Only add explanation.
- Keep it to 1-2 short sentences total. Be terse. No examples, no fix suggestions.
- Do not repeat the SQL code.
- Do NOT use markdown (no **bold**, no headings, no bullet lists). Plain text only.
- Output exactly two lines in this format, nothing else:
EN: <English explanation>
KO: <Korean explanation>
"""


def _table_names(node: exp.Expression) -> list[str]:
    """AST 노드 하위의 테이블명을 중복 없이 추출한다(ERD 강조 매칭용)."""
    seen: list[str] = []
    for t in node.find_all(exp.Table):
        if t.name and t.name not in seen:
            seen.append(t.name)
    return seen


async def llm_explain_risk(
    sql: str,
    risks: list[Risk],
    schema_diff=None,
) -> tuple[str, str]:
    """결정적 위험 위에 LLM 해설을 영어·한국어로 생성한다. (en, ko) 튜플. Ollama 미기동 시 폴백."""
    if not risks:
        return "", ""

    risk_summary = "\n".join(
        f"- [{r.level.upper()}] {r.rule}: {r.message}" for r in risks
    )
    messages = [
        {"role": "system", "content": _RISK_EXPLAIN_SYSTEM},
        {
            "role": "user",
            "content": f"SQL:\n{sql}\n\nDetected risks:\n{risk_summary}",
        },
    ]
    try:
        raw = await complete(messages, temperature=0.0)
        return _parse_bilingual(raw)
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
                    message="DELETE without WHERE — all rows in the table will be deleted.",
                    message_ko="WHERE 없는 DELETE — 테이블 전체 행이 삭제됩니다.",
                    tables=_table_names(delete),
                )
            )

    # WHERE 없는 UPDATE
    for update in ast.find_all(exp.Update):
        if not update.args.get("where"):
            risks.append(
                Risk(
                    level="critical",
                    rule="UPDATE_WITHOUT_WHERE",
                    message="UPDATE without WHERE — all rows in the table will be changed.",
                    message_ko="WHERE 없는 UPDATE — 테이블 전체 행이 변경됩니다.",
                    tables=_table_names(update),
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
                    message="DROP TABLE — the table and all its data are permanently deleted.",
                    message_ko="DROP TABLE — 테이블과 모든 데이터가 영구 삭제됩니다.",
                    tables=_table_names(drop),
                )
            )

    # TRUNCATE
    for truncate in ast.find_all(exp.TruncateTable):
        risks.append(
            Risk(
                level="critical",
                rule="TRUNCATE",
                message="TRUNCATE — quickly removes all rows from the table.",
                message_ko="TRUNCATE — 테이블의 모든 행을 빠르게 삭제합니다.",
                tables=_table_names(truncate),
            )
        )

    # ALTER TABLE 내 DROP COLUMN / ADD NOT NULL
    for alter in ast.find_all(exp.Alter):
        if str(alter.args.get("kind", "")).upper() != "TABLE":
            continue
        alter_tables = _table_names(alter)
        for action in alter.args.get("actions", []):
            # DROP COLUMN
            if isinstance(action, exp.Drop):
                col_kind = str(action.args.get("kind", "")).upper()
                if col_kind == "COLUMN":
                    risks.append(
                        Risk(
                            level="critical",
                            rule="DROP_COLUMN",
                            message="DROP COLUMN — the column and its data are permanently deleted.",
                            message_ko="DROP COLUMN — 컬럼과 해당 데이터가 영구 삭제됩니다.",
                            tables=alter_tables,
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
                            message="Adding a NOT NULL column without DEFAULT — existing rows may error.",
                            message_ko="DEFAULT 없는 NOT NULL 컬럼 추가 — 기존 행에서 오류가 발생할 수 있습니다.",
                            tables=alter_tables,
                        )
                    )

    # CASCADE — Drop.args["cascade"] 또는 Alter.args["cascade"]
    cascade_nodes = [
        node for node in ast.find_all((exp.Drop, exp.Alter)) if node.args.get("cascade")
    ]
    if cascade_nodes:
        cascade_tables: list[str] = []
        for n in cascade_nodes:
            for t in _table_names(n):
                if t not in cascade_tables:
                    cascade_tables.append(t)
        risks.append(
            Risk(
                level="warning",
                rule="CASCADE",
                message="CASCADE — cascading deletes/changes may occur.",
                message_ko="CASCADE — 연쇄 삭제/변경이 발생할 수 있습니다.",
                tables=cascade_tables,
            )
        )

    return risks


def _fallback_risk_note(risks: list[Risk]) -> tuple[str, str]:
    """Ollama 미기동 시 위험 목록 기반 간단 폴백 해설. (en, ko) 튜플."""
    n_crit = sum(1 for r in risks if r.level == "critical")
    n_warn = sum(1 for r in risks if r.level == "warning")
    en = f"{n_crit} critical, {n_warn} warning risk(s) detected. Start Ollama for a detailed explanation."
    ko = f"치명적 {n_crit}건, 경고 {n_warn}건이 감지되었습니다. 자세한 해설은 Ollama 기동 후 다시 시도하세요."
    return en, ko
