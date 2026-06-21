"""POST /api/analyze, POST /api/apply — ARCHITECTURE §6."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_meta_session, target_engine
from app.llm.client import OllamaError
from app.pipeline.executor import apply, consume_token, store_token
from app.pipeline.explain import explain_sql
from app.pipeline.input_router import classify_input
from app.pipeline.nl2sql import generate_sql
from app.pipeline.rag import retrieve
from app.pipeline.risk import deterministic_rules, llm_explain_risk
from app.pipeline.schema_graph import build_graph
from app.pipeline.simulation import simulate_data, simulate_schema
from app.pipeline.validation import ValidationError, check_forbidden, parse
from app.schemas.analysis import (
    AnalyzeRequest,
    AnalyzeResponse,
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
        before: SchemaGraph = build_graph(target_engine)
        before_tables = {n.id: n for n in before.nodes}

        try:
            sim_result = simulate_schema(ast, before)
            schema_diff = sim_result
        except Exception:
            schema_diff = None

        first_token = sql.split()[0].lower().rstrip(";") if sql.split() else ""
        if first_token in _DML_SQL_TYPES:
            try:
                data_sim = simulate_data(sql, target_engine)
            except Exception:
                data_sim = None

        try:
            from app.pipeline.executor import build_down_script
            down_script = build_down_script(ast, before_tables) or None
        except Exception:
            down_script = None

    # 6. LLM 위험 해설 (2차 — 결정적 판단 불변, 해설만 추가)
    if risks:
        risk_note = await llm_explain_risk(sql, risks, schema_diff)
        risks = [r.model_copy(update={"llm_note": risk_note}) if i == 0 else r for i, r in enumerate(risks)]

    # 7. LLM 자연어 설명 (explain_sql — Ollama 미기동 시 폴백)
    explanation = await explain_sql(sql)

    # #1: hasCritical 파생 필드
    has_critical = any(r.level == "critical" for r in risks)

    # 8. token 발급
    response = AnalyzeResponse(
        mode=detected_mode.value,
        detectedConfidence=confidence,
        sql=sql,
        explanation=explanation,
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
            "message": "자연어 처리에 Ollama가 필요하지만 연결할 수 없습니다. SQL 직접 입력 모드를 사용하거나 Ollama를 기동하세요.",
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

    # #1 hasCritical 또는 risks 배열 직접 확인 — 둘 다 critical 차단
    critical_risks = [r for r in cached.risks if r.level == "critical"]
    if critical_risks or cached.hasCritical:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "CRITICAL_RISK_BLOCKED",
                "message": "critical 위험이 포함된 SQL은 적용할 수 없습니다.",
                "risks": [r.model_dump(by_alias=True) for r in critical_risks],
            },
        )

    if not cached.valid:
        raise HTTPException(status_code=422, detail="유효하지 않은 SQL입니다.")

    try:
        result = apply(cached.sql, cached.downScript, session)
        session.commit()
    except ValidationError as e:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"적용 중 오류: {e}")

    # 적용 성공 직후 증분 reindex (실패해도 apply 결과에 영향 없음)
    try:
        from app.pipeline.rag import reindex_schema
        await reindex_schema(target_engine)
    except Exception:
        pass

    return result
