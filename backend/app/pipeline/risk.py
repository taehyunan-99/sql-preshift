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
    - ADD FOREIGN KEY(NOT VALID 아님) → critical (양 테이블 락 + 전체 검증 스캔)
    - VACUUM FULL → critical (테이블 전체 재작성 + ACCESS EXCLUSIVE 락)
    - CASCADE 절 포함 → warning
    - NOT NULL 컬럼 추가(DEFAULT 없음) → warning
    - volatile DEFAULT 컬럼 추가 → warning (전체 재작성)
    - ALTER COLUMN TYPE → warning (테이블 재작성 + ACCESS EXCLUSIVE 락)
    - ALTER COLUMN SET NOT NULL → warning (전체 스캔 + 락)
    - RENAME COLUMN/TABLE → warning (앱 코드 깨짐)
    - ADD CHECK(NOT VALID 아님) → warning (전체 스캔 + 락)
    - CREATE INDEX(비 CONCURRENTLY) → warning (쓰기 차단)
    - ADD UNIQUE/PRIMARY KEY → warning (인덱스 빌드 락)
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
                # volatile DEFAULT(함수 호출 등 비상수) — PG11+ 상수 DEFAULT는 메타데이터 변경(빠름)이지만,
                # now()/gen_random_uuid() 같은 비상수는 전체 테이블 재작성을 강제한다.
                elif has_default:
                    default_const = next(
                        (
                            c.args.get("kind")
                            for c in constraints
                            if isinstance(c, exp.ColumnConstraint)
                            and isinstance(c.args.get("kind"), exp.DefaultColumnConstraint)
                        ),
                        None,
                    )
                    default_val = default_const.args.get("this") if default_const else None
                    # 상수(Literal/불리언/NULL)가 아니라 함수/익명 표현이면 volatile로 본다.
                    if default_val is not None and default_val.find(exp.Func, exp.Anonymous):
                        risks.append(
                            Risk(
                                level="warning",
                                rule="ADD_COLUMN_VOLATILE_DEFAULT",
                                message="ADD COLUMN with a volatile DEFAULT forces a full table rewrite under lock — backfill in batches instead.",
                                message_ko="volatile DEFAULT가 있는 컬럼 추가 — 락 상태로 테이블 전체를 재작성합니다. 배치로 백필하세요.",
                                tables=alter_tables,
                            )
                        )

            # ALTER COLUMN — 락 유발 변경(운영 중 다운타임 위험)
            elif isinstance(action, exp.AlterColumn):
                # 타입 변경: dtype 지정 시 → 테이블 전체 재작성 + ACCESS EXCLUSIVE 락
                if action.args.get("dtype") is not None:
                    risks.append(
                        Risk(
                            level="warning",
                            rule="ALTER_COLUMN_TYPE",
                            message="ALTER COLUMN TYPE — rewrites the whole table under an ACCESS EXCLUSIVE lock, blocking reads/writes.",
                            message_ko="ALTER COLUMN TYPE — 테이블 전체를 재작성하며 ACCESS EXCLUSIVE 락으로 읽기/쓰기를 차단합니다.",
                            tables=alter_tables,
                        )
                    )
                # SET NOT NULL: allow_null=False(타입 변경 아님) → 전체 스캔 + 락
                elif action.args.get("allow_null") is False:
                    risks.append(
                        Risk(
                            level="warning",
                            rule="SET_NOT_NULL",
                            message="SET NOT NULL — scans the entire table under a lock to validate existing rows.",
                            message_ko="SET NOT NULL — 기존 행 검증을 위해 락 상태로 테이블 전체를 스캔합니다.",
                            tables=alter_tables,
                        )
                    )

            # 컬럼/테이블 RENAME — DDL 자체는 즉시·안전하나, 옛 이름을 참조하는 앱 코드가 즉시 깨진다.
            # sqlglot: 컬럼=RenameColumn, 테이블=AlterRename.
            elif isinstance(action, (exp.RenameColumn, exp.AlterRename)):
                risks.append(
                    Risk(
                        level="warning",
                        rule="RENAME_COLUMN_OR_TABLE",
                        message="RENAME breaks application code referencing the old name — coordinate with a deploy that no longer uses it.",
                        message_ko="RENAME은 옛 이름을 참조하는 애플리케이션 코드를 즉시 깨뜨립니다 — 옛 이름을 더 이상 쓰지 않는 배포와 함께 진행하세요.",
                        tables=alter_tables,
                    )
                )

            # ADD CONSTRAINT — PK/UNIQUE(인덱스 빌드 락) / FK·CHECK(검증 스캔 + 양 테이블 락)
            elif isinstance(action, (exp.AddConstraint, exp.PrimaryKey)):
                is_pk = isinstance(action, exp.PrimaryKey) or action.find(exp.PrimaryKey) is not None
                is_unique = action.find(exp.UniqueColumnConstraint) is not None
                is_fk = action.find(exp.ForeignKey) is not None
                is_check = action.find(exp.Check) is not None or action.find(exp.CheckColumnConstraint) is not None
                # NOT VALID는 Alter 노드의 플래그 — 있으면 기존 행 검증을 건너뛰어 락/스캔이 짧다.
                not_valid = bool(alter.args.get("not_valid"))
                if is_pk or is_unique:
                    kind_label = "PRIMARY KEY" if is_pk else "UNIQUE"
                    risks.append(
                        Risk(
                            level="warning",
                            rule="ADD_PK_OR_UNIQUE",
                            message=f"ADD {kind_label} — builds an index that blocks writes on the table until complete.",
                            message_ko=f"ADD {kind_label} — 완료될 때까지 테이블 쓰기를 차단하는 인덱스를 생성합니다.",
                            tables=alter_tables,
                        )
                    )
                # FK 검증형(NOT VALID 아님) — 참조/피참조 양 테이블에 ACCESS EXCLUSIVE + 전체 행 검증.
                elif is_fk and not not_valid:
                    risks.append(
                        Risk(
                            level="critical",
                            rule="ADD_FK_VALIDATING",
                            message="ADD FOREIGN KEY without NOT VALID — locks both tables and scans all rows to validate; use NOT VALID then VALIDATE CONSTRAINT.",
                            message_ko="NOT VALID 없는 FK 추가 — 양 테이블을 잠그고 전체 행을 검증 스캔합니다. NOT VALID로 추가 후 VALIDATE CONSTRAINT를 쓰세요.",
                            tables=alter_tables,
                        )
                    )
                # CHECK 검증형(NOT VALID 아님) — 테이블 전체를 ACCESS EXCLUSIVE 락으로 스캔.
                elif is_check and not not_valid:
                    risks.append(
                        Risk(
                            level="warning",
                            rule="ADD_CHECK_VALIDATING",
                            message="ADD CHECK without NOT VALID — scans the whole table under an ACCESS EXCLUSIVE lock; use NOT VALID then VALIDATE CONSTRAINT.",
                            message_ko="NOT VALID 없는 CHECK 추가 — ACCESS EXCLUSIVE 락으로 테이블 전체를 스캔합니다. NOT VALID로 추가 후 VALIDATE CONSTRAINT를 쓰세요.",
                            tables=alter_tables,
                        )
                    )

    # CREATE INDEX(비 CONCURRENTLY) — 인덱스 빌드 동안 테이블 쓰기 차단
    for create in ast.find_all(exp.Create):
        if str(create.args.get("kind", "")).upper() != "INDEX":
            continue
        if create.args.get("concurrently"):
            # CONCURRENTLY는 쓰기 차단은 없으나, 트랜잭션 블록 안에서 실행 불가.
            # 우리 apply/apply_all은 단일 TX(engine.begin())로 감싸므로 런타임에 폭발한다.
            risks.append(
                Risk(
                    level="warning",
                    rule="CONCURRENTLY_IN_TRANSACTION",
                    message="CREATE INDEX CONCURRENTLY cannot run inside a transaction block, but Apply/Apply All wraps changes in one transaction — it will fail at runtime. Run it separately in autocommit.",
                    message_ko="CREATE INDEX CONCURRENTLY는 트랜잭션 블록 안에서 실행할 수 없는데 Apply/Apply All은 단일 트랜잭션으로 감쌉니다 — 런타임에 실패합니다. autocommit으로 따로 실행하세요.",
                    tables=_table_names(create),
                )
            )
            continue  # 쓰기 차단 룰은 비대상(CONCURRENTLY는 락 안 잡음)
        risks.append(
            Risk(
                level="warning",
                rule="CREATE_INDEX_BLOCKING",
                message="CREATE INDEX without CONCURRENTLY — blocks writes on the table while the index builds.",
                message_ko="CONCURRENTLY 없는 CREATE INDEX — 인덱스 생성 동안 테이블 쓰기를 차단합니다.",
                tables=_table_names(create),
            )
        )

    # DROP INDEX CONCURRENTLY도 동일하게 트랜잭션 블록 불가.
    for drop in ast.find_all(exp.Drop):
        if str(drop.args.get("kind", "")).upper() != "INDEX":
            continue
        if not drop.args.get("concurrently"):
            continue  # 일반 DROP INDEX는 트랜잭션 가능 — 별도 위험 없음
        risks.append(
            Risk(
                level="warning",
                rule="CONCURRENTLY_IN_TRANSACTION",
                message="DROP INDEX CONCURRENTLY cannot run inside a transaction block, but Apply/Apply All wraps changes in one transaction — it will fail at runtime. Run it separately in autocommit.",
                message_ko="DROP INDEX CONCURRENTLY는 트랜잭션 블록 안에서 실행할 수 없는데 Apply/Apply All은 단일 트랜잭션으로 감쌉니다 — 런타임에 실패합니다. autocommit으로 따로 실행하세요.",
                tables=_table_names(drop),
            )
        )

    # VACUUM FULL — 테이블 전체를 ACCESS EXCLUSIVE 락으로 재작성(읽기/쓰기 전면 차단).
    # sqlglot은 VACUUM을 Command(this='VACUUM', expression='FULL <table>')로 파싱한다.
    # (CLUSTER는 parse 단계에서 ValidationError로 이미 거부되므로 여기 도달 안 함.)
    for cmd in ast.find_all(exp.Command):
        if str(cmd.args.get("this", "")).upper() != "VACUUM":
            continue
        expr = str(cmd.args.get("expression", "")).strip().strip("'").strip('"')
        if not expr.upper().startswith("FULL"):
            continue  # 일반 VACUUM은 락 없음 — 안전
        # expression 잔여("FULL products")에서 테이블명 추출(마지막 토큰).
        rest = expr[len("FULL"):].strip()
        vacuum_tables = [rest.split()[-1]] if rest else []
        risks.append(
            Risk(
                level="critical",
                rule="TABLE_REWRITE_FULL",
                message="VACUUM FULL rewrites the entire table under an ACCESS EXCLUSIVE lock — full read/write outage; never run online.",
                message_ko="VACUUM FULL — ACCESS EXCLUSIVE 락으로 테이블 전체를 재작성합니다. 읽기/쓰기가 전면 중단되므로 운영 중 실행하지 마세요.",
                tables=vacuum_tables,
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

    # golden path 주입 — 각 룰에 "차단" 대신 "대신 이렇게 하라"는 안전 대안을 붙인다.
    # 현업 정석 패턴(strong_migrations/GitLab/PG16 검증 기반). 단일 statement AST만 보는
    # 도구의 정직한 포지션: 위험을 알리되 안전 경로를 제시한다.
    for r in risks:
        sug = _GOLDEN_PATHS.get(r.rule)
        if sug:
            r.suggestion, r.suggestion_ko = sug

    return risks


# 룰 ID → (영어 suggestion, 한국어 suggestion). 위험 룰의 actionable 안전 대안.
_GOLDEN_PATHS: dict[str, tuple[str, str]] = {
    "ADD_FK_VALIDATING": (
        "Split into two statements: ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID (no scan, near-instant), then VALIDATE CONSTRAINT (takes only SHARE UPDATE EXCLUSIVE — concurrent reads/writes proceed).",
        "두 구문으로 분리하세요: ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID(스캔 없음, 거의 즉시) 후 VALIDATE CONSTRAINT(SHARE UPDATE EXCLUSIVE만 잡아 동시 읽기/쓰기 허용).",
    ),
    "ADD_CHECK_VALIDATING": (
        "Split into ADD CONSTRAINT ... CHECK (...) NOT VALID (commits immediately, no existing-row scan) then VALIDATE CONSTRAINT in a separate statement (SHARE UPDATE EXCLUSIVE — does not block concurrent reads/writes).",
        "ADD CONSTRAINT ... CHECK (...) NOT VALID(즉시 커밋, 기존 행 스캔 없음) 후 별도 구문으로 VALIDATE CONSTRAINT(SHARE UPDATE EXCLUSIVE — 동시 읽기/쓰기 차단 안 함)로 분리하세요.",
    ),
    "SET_NOT_NULL": (
        "On large/high-traffic tables avoid the long ACCESS EXCLUSIVE lock: ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID, then VALIDATE CONSTRAINT, then SET NOT NULL (PG12+ skips the full scan when a valid CHECK proves no NULLs).",
        "크거나 트래픽 많은 테이블은 긴 ACCESS EXCLUSIVE 락을 피하세요: ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID → VALIDATE CONSTRAINT → SET NOT NULL(PG12+는 유효 CHECK가 NULL 없음을 증명하면 전체 스캔을 건너뜀).",
    ),
    "ADD_NOT_NULL_NO_DEFAULT": (
        "Add the column nullable (a constant DEFAULT is rewrite-free on PG11+), backfill in batches, then enforce NOT NULL via a NOT VALID CHECK + VALIDATE + SET NOT NULL.",
        "컬럼을 nullable로 추가(PG11+는 상수 DEFAULT가 재작성 없음)하고 배치로 백필한 뒤, NOT VALID CHECK + VALIDATE + SET NOT NULL로 NOT NULL을 강제하세요.",
    ),
    "ADD_COLUMN_VOLATILE_DEFAULT": (
        "Add the column nullable without the default, backfill the value in batches, then SET DEFAULT — avoids the full-table rewrite a volatile default forces.",
        "기본값 없이 nullable로 컬럼을 추가하고 값을 배치로 백필한 뒤 SET DEFAULT 하세요 — volatile DEFAULT가 강제하는 전체 재작성을 피합니다.",
    ),
    "ALTER_COLUMN_TYPE": (
        "If this rewrites the table (type narrowing or scale change), use expand-contract: add a new-typed column, sync via trigger, backfill in batches, switch the app, then drop the old column in a later release. Widening (e.g. varchar(50)→text) is rewrite-free on PG16.",
        "재작성이 일어나는 변경(타입 축소·scale 변경)이면 expand-contract를 쓰세요: 새 타입 컬럼 추가 → 트리거로 동기화 → 배치 백필 → 앱 전환 → 다음 릴리스에서 옛 컬럼 제거. 확대(예: varchar(50)→text)는 PG16에서 재작성이 없습니다.",
    ),
    "CREATE_INDEX_BLOCKING": (
        "Use CREATE INDEX CONCURRENTLY to avoid blocking writes — but run it outside any transaction (autocommit), separately from Apply/Apply All.",
        "쓰기 차단을 피하려면 CREATE INDEX CONCURRENTLY를 쓰되, 트랜잭션 밖(autocommit)에서 Apply/Apply All과 별도로 실행하세요.",
    ),
    "CONCURRENTLY_IN_TRANSACTION": (
        "Run this single statement on its own in autocommit (not via Apply All). If a CONCURRENTLY build fails midway it can leave an INVALID index — clean it up with DROP INDEX CONCURRENTLY before retrying.",
        "이 구문은 autocommit으로 단독 실행하세요(Apply All 경유 금지). CONCURRENTLY 빌드가 중간에 실패하면 INVALID 인덱스가 남을 수 있으니 재시도 전 DROP INDEX CONCURRENTLY로 정리하세요.",
    ),
    "ADD_PK_OR_UNIQUE": (
        "Build the index concurrently first: CREATE UNIQUE INDEX CONCURRENTLY (outside a transaction), then ADD CONSTRAINT ... UNIQUE/PRIMARY KEY USING INDEX <idx> (fast metadata-only promotion).",
        "먼저 인덱스를 동시 빌드하세요: CREATE UNIQUE INDEX CONCURRENTLY(트랜잭션 밖) 후 ADD CONSTRAINT ... UNIQUE/PRIMARY KEY USING INDEX <idx>(빠른 메타데이터 전환).",
    ),
    "DROP_COLUMN": (
        "Ship app code that stops referencing the column first (so cached plans / SELECT * don't break), then DROP it in the next release (expand-contract). Beware connection pools (PgBouncer) holding old plans.",
        "먼저 컬럼 참조를 멈춘 앱 코드를 배포(캐시된 plan/SELECT * 가 안 깨지도록)한 뒤 다음 릴리스에서 DROP 하세요(expand-contract). 옛 plan을 든 커넥션 풀(PgBouncer)에 주의하세요.",
    ),
    "DROP_TABLE": (
        "DROP is fast but breaks any app still referencing the table. Stop using it in app code and ship that first, then DROP in a later release.",
        "DROP은 빠르지만 그 테이블을 참조하는 앱을 깨뜨립니다. 앱 코드에서 사용을 멈추고 먼저 배포한 뒤, 다음 릴리스에서 DROP 하세요.",
    ),
    "RENAME_COLUMN_OR_TABLE": (
        "The real risk is an app-compatibility race during rolling deploys, not locking. Prefer expand-contract: add a new column, sync both via a trigger, backfill, switch the app, then drop the old one later.",
        "진짜 위험은 락이 아니라 rolling deploy 중 앱 호환성 레이스입니다. expand-contract를 권합니다: 새 컬럼 추가 → 트리거로 양쪽 동기화 → 백필 → 앱 전환 → 나중에 옛 컬럼 제거.",
    ),
    "DELETE_WITHOUT_WHERE": (
        "If you meant to affect every row, scope it explicitly. For large deletes use a keyset batch loop (id > :last ORDER BY id LIMIT 10000), each batch in its own committed transaction — keeps locks brief and avoids pinning the xmin horizon.",
        "전체 행이 의도였다면 명시적으로 범위를 지정하세요. 대량 삭제는 keyset 배치 루프(id > :last ORDER BY id LIMIT 10000)로, 각 배치를 개별 커밋하세요 — 락을 짧게 유지하고 xmin horizon 고정을 피합니다.",
    ),
    "UPDATE_WITHOUT_WHERE": (
        "If you meant to affect every row, scope it explicitly. For large updates use a keyset batch loop (id > :last ORDER BY id LIMIT 10000), each batch in its own committed transaction — keeps locks brief and avoids pinning the xmin horizon.",
        "전체 행이 의도였다면 명시적으로 범위를 지정하세요. 대량 변경은 keyset 배치 루프(id > :last ORDER BY id LIMIT 10000)로, 각 배치를 개별 커밋하세요 — 락을 짧게 유지하고 xmin horizon 고정을 피합니다.",
    ),
    "CASCADE": (
        "CASCADE silently drops dependent objects (views, FKs, grants), possibly across schemas, without listing them. Run the same statement with RESTRICT first — it fails and names every dependent object so you can confirm the blast radius.",
        "CASCADE는 의존 객체(view, FK, 권한)를 다른 스키마까지 나열 없이 조용히 드롭합니다. 같은 구문을 RESTRICT로 먼저 실행하세요 — 실패하면서 의존 객체를 이름까지 알려줘 영향 범위를 확인할 수 있습니다.",
    ),
    "TABLE_REWRITE_FULL": (
        "VACUUM FULL rewrites the whole table under ACCESS EXCLUSIVE — a full outage proportional to table size. Use pg_repack for online repacking, or schedule a maintenance window.",
        "VACUUM FULL은 ACCESS EXCLUSIVE 락으로 테이블 전체를 재작성합니다 — 크기에 비례한 전면 중단입니다. 온라인 재정리는 pg_repack을 쓰거나 점검 창을 잡으세요.",
    ),
}


def _fallback_risk_note(risks: list[Risk]) -> tuple[str, str]:
    """Ollama 미기동 시 위험 목록 기반 간단 폴백 해설. (en, ko) 튜플."""
    n_crit = sum(1 for r in risks if r.level == "critical")
    n_warn = sum(1 for r in risks if r.level == "warning")
    en = f"{n_crit} critical, {n_warn} warning risk(s) detected. Start Ollama for a detailed explanation."
    ko = f"치명적 {n_crit}건, 경고 {n_warn}건이 감지되었습니다. 자세한 해설은 Ollama 기동 후 다시 시도하세요."
    return en, ko
