from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.audit import router as audit_router
from app.api.connection import router as connection_router
from app.api.pipeline import router as pipeline_router
from app.api.schema import router as schema_router
from app.db import create_meta_tables, get_target_engine, is_target_connected


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 앱 메타 테이블 보장 (설치형 SQLite — alembic/pgvector 불필요)
    create_meta_tables()

    # ① 시작 시 전체 스키마 임베딩 동기화 (M6 RAG) — target 연결돼 있을 때만.
    # 미연결이면 온보딩에서 연결 시점에 reindex하므로 여기선 스킵.
    if is_target_connected():
        try:
            from app.pipeline.rag import reindex_schema
            await reindex_schema(get_target_engine())
        except Exception:
            # Ollama 미기동 또는 DB 미준비 시 무시 (결정적 경로 영향 없음)
            pass

    yield


app = FastAPI(title="SQLPreShift", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schema_router)
app.include_router(pipeline_router)
app.include_router(audit_router)
app.include_router(connection_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
