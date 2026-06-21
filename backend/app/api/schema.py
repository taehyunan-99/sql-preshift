from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import target_engine
from app.pipeline.schema_graph import build_graph
from app.schemas.schema_graph import SchemaGraph

router = APIRouter(prefix="/api/schema", tags=["schema"])


@router.get("/graph", response_model=SchemaGraph)
async def get_schema_graph() -> SchemaGraph:
    """대상 DB의 현재 스키마 ERD 그래프를 반환한다."""
    return build_graph(target_engine)


class ReindexResponse(BaseModel):
    indexed: int
    message: str


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_schema() -> ReindexResponse:
    """RAG 임베딩 수동 재색인 — ARCHITECTURE §6."""
    from app.llm.client import OllamaError
    from app.pipeline.rag import reindex_schema as _reindex

    try:
        count = await _reindex(target_engine)
        return ReindexResponse(indexed=count, message=f"{count}개 청크 재색인 완료")
    except OllamaError as e:
        raise HTTPException(status_code=503, detail=f"Ollama 연결 실패: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"재색인 오류: {e}")
