from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_target_engine
from app.pipeline.diagnostics import annotate_diagnostics
from app.pipeline.schema_graph import build_graph
from app.schemas.schema_graph import SchemaGraph

router = APIRouter(prefix="/api/schema", tags=["schema"])


@router.get("/graph", response_model=SchemaGraph)
async def get_schema_graph() -> SchemaGraph:
    """대상 DB의 현재 스키마 ERD 그래프를 반환한다.

    무결성 진단(read-only·metadata-only)을 박아 초기 화면부터 진단 패널이 채워진다.
    (analyze 전에도 "이 DB에 이런 문제가 있다"를 보여준다 — pipeline.py와 동일 호출.)
    """
    engine = get_target_engine()
    if engine is None:
        # UI 노출 문자열은 영어(주석은 한국어) — 미연결 상태
        raise HTTPException(status_code=503, detail="Database not connected.")
    return annotate_diagnostics(build_graph(engine), engine, schema="public")


class ReindexResponse(BaseModel):
    indexed: int
    message: str


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_schema() -> ReindexResponse:
    """RAG 임베딩 수동 재색인 — ARCHITECTURE §6."""
    from app.llm.client import OllamaError
    from app.pipeline.rag import reindex_schema as _reindex

    engine = get_target_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database not connected.")
    try:
        count = await _reindex(engine)
        return ReindexResponse(indexed=count, message=f"Reindexed {count} chunks.")
    except OllamaError as e:
        raise HTTPException(status_code=503, detail=f"Ollama connection failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindex failed: {e}")
