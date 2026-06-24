"""POST /api/analyze, POST /api/apply — ARCHITECTURE §6."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_meta_session, get_target_engine
from app.llm.client import OllamaError
from app.pipeline.executor import apply, consume_token, store_token
from app.pipeline.explain import explain_sql
from app.pipeline.input_router import classify_input
from app.pipeline.diagnostics import annotate_diagnostics
from app.pipeline.nl2sql import generate_sql
from app.pipeline.rag import retrieve
from app.pipeline.risk import deterministic_rules, llm_explain_risk
from app.pipeline.schema_graph import build_graph
from app.pipeline.simulation import (
    fold_baseline,
    simulate_cumulative,
    simulate_data,
    simulate_schema,
)
from app.pipeline.validation import ValidationError, check_forbidden, parse
from app.schemas.analysis import (
    AnalyzeRequest,
    AnalyzeResponse,
    ApplyAllRequest,
    ApplyAllResult,
    ApplyRequest,
    ApplyResult,
    DataSimResult,
    InputMode,
    Risk,
)
from app.schemas.schema_graph import SchemaGraph

router = APIRouter(prefix="/api", tags=["pipeline"])

_DML_SQL_TYPES = {"select", "insert", "update", "delete"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, session: Session = Depends(get_meta_session)):
    """입력 분기 → 생성/파싱 → 검증 → 시뮬레이션 → 위험감지 → 설명 → 프리뷰 전체."""
    # #7: input 또는 sql 필드 모두 수용
    raw_input = req.get_raw_input()

    # 1. 입력 분류
    if req.mode == InputMode.AUTO:
        detected_mode, confidence = classify_input(raw_input)
    else:
        detected_mode, confidence = req.mode, 1.0

    # 2. NL 경로: retrieve → generate_sql (보안: 반드시 M2 validation 통과 강제)
    if detected_mode == InputMode.NL:
        try:
            retrieved = await retrieve(raw_input)
            draft = await generate_sql(raw_input, retrieved)
            sql = draft.sql
        except OllamaError as e:
            return _ollama_unavailable_response(detected_mode, confidence, str(e))
        except Exception as e:
            return _ollama_unavailable_response(detected_mode, confidence, str(e))
    else:
        sql = raw_input

    # 3. 파싱 + 검증 (NL 생성 SQL도 반드시 동일 경로 통과)
    # #4: violations은 message 문자열 배열로 직렬화
    violation_messages: list[str] = []
    ast = None
    try:
        ast = parse(sql)
        raw_violations = check_forbidden(ast)
        violation_messages = [v.message for v in raw_violations]
    except ValidationError as e:
        violation_messages = [str(e)]

    valid = ast is not None and len(violation_messages) == 0

    # 4. 위험 룰 (파싱 성공 시)
    risks: list[Risk] = []
    if ast is not None:
        risks = deterministic_rules(ast)

    # 5. 시뮬레이션 (파싱 성공 + 위반 없음)
    schema_diff = None
    data_sim: DataSimResult | None = None
    down_script: str | None = None

    if valid and ast is not None:
        engine = get_target_engine()
        if engine is None:
            # UI 노출 문자열은 영어(주석은 한국어) — 미연결 상태
            raise HTTPException(status_code=503, detail="Database not connected.")
        base: SchemaGraph = build_graph(engine)
        # 무결성 진단(read-only, metadata-only)을 base에 박는다 → diff 흐름이 model_copy로 보존.
        base = annotate_diagnostics(base, engine, schema="public")
        # 누적 dry-run: priorSqls가 있으면 before=원본 실DB, after=(prior+현재) 전부 적용
        # → 스택에 쌓인 모든 변경이 한 화면에 누적 표시된다. down_script는 직전 baseline 기준.
        if req.priorSqls:
            # 두 diff 동시 생성: Split뷰=직전 1개(baseline 대비 현재 SQL만 — 선명한 비교),
            # Unified뷰=스택 전체(원본 실DB 대비 prior+현재 누적). cumulative_after에 후자를 실어 보냄.
            try:
                baseline = fold_baseline(req.priorSqls, base)  # 직전 누적 기준(Split before·down_script)
            except ValidationError as e:
                raise HTTPException(status_code=422, detail=f"Cumulative baseline error: {e}")
            before_tables = {n.id: n for n in baseline.nodes}
            try:
                schema_diff = simulate_schema(ast, baseline)  # 직전 1개 diff
                cumulative = simulate_cumulative(req.priorSqls, ast, base)  # 전체 누적
                schema_diff = schema_diff.model_copy(
                    update={"cumulative_after": cumulative.after}
                )
            except ValidationError as e:
                raise HTTPException(status_code=422, detail=f"Cumulative simulation error: {e}")
            except Exception:
                schema_diff = None
        else:
            before_tables = {n.id: n for n in base.nodes}
            try:
                schema_diff = simulate_schema(ast, base)
            except Exception:
                schema_diff = None

        first_token = sql.split()[0].lower().rstrip(";") if sql.split() else ""
        # 누적 중에는 dataSim 생략 — simulate_data는 실DB 실행이라 가상 baseline과 불일치.
        if not req.priorSqls and first_token in _DML_SQL_TYPES:
            try:
                data_sim = simulate_data(sql, engine)
            except Exception:
                data_sim = None
        # ALTER ... SET NOT NULL: 적용 시 위반할 기존 NULL 행 수를 read-only로 점검(누적 중에도 실DB 기준 유효).
        elif data_sim is None:
            try:
                from app.pipeline.simulation import simulate_constraint_violation

                cv = simulate_constraint_violation(ast, engine)
                if cv is not None:
                    n, hint_en, hint_ko = cv
                    data_sim = DataSimResult(
                        affectedRows=0,
                        estimatedRows=0,
                        constraintViolations=n,
                        constraintHint=hint_en,
                        constraintHintKo=hint_ko,
                    )
            except Exception:
                data_sim = None

        try:
            from app.pipeline.executor import build_down_script
            down_script = build_down_script(ast, before_tables) or None
        except Exception:
            down_script = None

    # 6. LLM 위험 해설 (2차 — 결정적 판단 불변, 해설만 추가). 영/한 동시 생성.
    if risks:
        risk_note_en, risk_note_ko = await llm_explain_risk(sql, risks, schema_diff)
        risks = [
            r.model_copy(update={"llm_note": risk_note_en, "llm_note_ko": risk_note_ko}) if i == 0 else r
            for i, r in enumerate(risks)
        ]

    # 7. LLM 자연어 설명 (explain_sql — 영/한 동시 생성, Ollama 미기동 시 폴백)
    explanation, explanation_ko = await explain_sql(sql)

    # #1: hasCritical 파생 필드
    has_critical = any(r.level == "critical" for r in risks)

    # 8. token 발급
    response = AnalyzeResponse(
        mode=detected_mode.value,
        detectedConfidence=confidence,
        sql=sql,
        explanation=explanation,
        explanationKo=explanation_ko,
        valid=valid,
        violations=violation_messages,
        schemaDiff=schema_diff,
        dataSim=data_sim,
        risks=risks,
        hasCritical=has_critical,
        downScript=down_script,
        token="",
    )
    token = store_token(response)
    response = response.model_copy(update={"token": token})
    _token_cache_update(token, response)

    return response


def _ollama_unavailable_response(mode: InputMode, confidence: float, detail: str) -> AnalyzeResponse:
    """Ollama 미기동 시 503에 해당하는 구조화 에러 응답."""
    from fastapi import HTTPException as _HTTPException
    raise _HTTPException(
        status_code=503,
        detail={
            "error": "OLLAMA_UNAVAILABLE",
            "message": "Natural-language processing requires Ollama, but it is unreachable. Use the direct SQL input mode, or start Ollama.",
            "detail": detail,
        },
    )


def _token_cache_update(token: str, response: AnalyzeResponse) -> None:
    from app.pipeline.executor import _token_cache
    _token_cache[token] = response


@router.post("/apply", response_model=ApplyResult)
async def api_apply(req: ApplyRequest, session: Session = Depends(get_meta_session)):
    """token으로 재검증 후 단일 TX 적용 + 감사 로그 기록 + 증분 reindex."""
    try:
        cached = consume_token(req.token)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # #1 critical 위험 — 명시 확인(confirmCritical) 없으면 차단(실수 방지), 확인 시 통과.
    critical_risks = [r for r in cached.risks if r.level == "critical"]
    if (critical_risks or cached.hasCritical) and not req.confirm_critical:
        # 토큰을 복원 — 차단은 최종 거부가 아니라 "확인 요청"이므로 confirm 재시도를 허용해야 함.
        _token_cache_update(req.token, cached)
        raise HTTPException(
            status_code=422,
            detail={
                "error": "CRITICAL_RISK_BLOCKED",
                # UI 노출 문자열은 영어(주석은 한국어)
                "message": "This SQL contains a critical risk. Set confirmCritical to apply after review.",
                "risks": [r.model_dump(by_alias=True) for r in critical_risks],
            },
        )

    if not cached.valid:
        raise HTTPException(status_code=422, detail="Invalid SQL.")

    engine = get_target_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database not connected.")

    try:
        # target_engine 명시 전달 — 미전달 시 session.get_bind()가 meta_engine을
        # 잡아 사용자 SQL이 메타 DB에 실행되는 버그 방지(실제 대상 DB 적용 보장).
        result = apply(
            cached.sql, cached.downScript, session, engine,
            confirm_critical=req.confirm_critical,
        )
        session.commit()
    except ValidationError as e:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error during apply: {e}")

    # 적용 성공 직후 증분 reindex (실패해도 apply 결과에 영향 없음)
    try:
        from app.pipeline.rag import reindex_schema
        await reindex_schema(engine)
    except Exception:
        pass

    return result


@router.post("/apply-all", response_model=ApplyAllResult)
async def api_apply_all(req: ApplyAllRequest, session: Session = Depends(get_meta_session)):
    """누적 dry-run으로 쌓은 N개 SQL을 단일 TX로 일괄 적용한다(all-or-nothing)."""
    from app.pipeline.executor import apply_all

    engine = get_target_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database not connected.")

    try:
        result = apply_all(req.sqls, session, engine, confirm_critical=req.confirm_critical)
        session.commit()
    except ValidationError as e:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(e))  # 금지 패턴/미확인 critical 시 422
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error during batch apply: {e}")

    # 적용 성공 직후 증분 reindex (실패해도 결과에 영향 없음)
    try:
        from app.pipeline.rag import reindex_schema
        await reindex_schema(engine)
    except Exception:
        pass

    return result
