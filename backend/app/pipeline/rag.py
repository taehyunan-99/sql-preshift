"""RAG — pgvector 스키마 임베딩/검색 — ARCHITECTURE §4."""

from __future__ import annotations

from typing import Literal

import sqlalchemy as sa
from pydantic import BaseModel
from sqlalchemy import Engine, inspect, text

from app.db import meta_engine
from app.llm.client import OllamaError, embed


class SchemaChunk(BaseModel):
    table: str
    kind: Literal["ddl", "desc", "example"]
    content: str


def _reflect_chunks(engine: Engine) -> list[SchemaChunk]:
    """대상 DB를 reflection해 테이블/컬럼 텍스트 청크를 생성한다.
    앱 메타 테이블은 NL→SQL 컨텍스트에 불필요하므로 제외(schema_graph와 동일 정책)."""
    from app.pipeline.schema_graph import _APP_META_TABLES

    insp = inspect(engine)
    chunks: list[SchemaChunk] = []

    for table_name in insp.get_table_names(schema="public"):
        if table_name in _APP_META_TABLES:
            continue
        columns = insp.get_columns(table_name, schema="public")
        pk_constraint = insp.get_pk_constraint(table_name, schema="public")
        pk_cols = set(pk_constraint.get("constrained_columns", []))
        fks = insp.get_foreign_keys(table_name, schema="public")
        fk_map = {fk["constrained_columns"][0]: fk for fk in fks if fk["constrained_columns"]}

        # DDL 청크
        col_defs = []
        for col in columns:
            parts = [f"  {col['name']} {col['type']}"]
            if col["name"] in pk_cols:
                parts[0] += " PRIMARY KEY"
            if not col.get("nullable", True):
                parts[0] += " NOT NULL"
            if col["name"] in fk_map:
                fk = fk_map[col["name"]]
                parts[0] += f" REFERENCES {fk['referred_table']}({fk['referred_columns'][0]})"
            col_defs.append(parts[0])

        ddl = f"CREATE TABLE {table_name} (\n" + ",\n".join(col_defs) + "\n);"
        chunks.append(SchemaChunk(table=table_name, kind="ddl", content=ddl))

        # 설명 청크 (컬럼 나열)
        col_names = ", ".join(c["name"] for c in columns)
        desc = f"테이블 {table_name}의 컬럼: {col_names}"
        chunks.append(SchemaChunk(table=table_name, kind="desc", content=desc))

    return chunks


async def reindex_schema(engine: Engine | None = None) -> int:
    """대상 스키마 reflection → 청크화 → 임베딩 → pgvector upsert. 처리된 청크 수 반환."""
    from app.db import get_target_engine
    eng = engine or get_target_engine()
    if eng is None:
        # target 미연결 — 색인할 대상 없음
        return 0

    chunks = _reflect_chunks(eng)
    if not chunks:
        return 0

    with meta_engine.begin() as conn:
        for chunk in chunks:
            try:
                vec = await embed(chunk.content)
            except OllamaError:
                vec = None

            # upsert: table_name + kind 기준
            existing = conn.execute(
                text(
                    "SELECT id FROM schema_embeddings "
                    "WHERE table_name = :t AND kind = :k"
                ),
                {"t": chunk.table, "k": chunk.kind},
            ).fetchone()

            if existing:
                conn.execute(
                    text(
                        "UPDATE schema_embeddings "
                        "SET content = :c, embedding = :e, updated_at = now() "
                        "WHERE id = :id"
                    ),
                    {"c": chunk.content, "e": vec, "id": existing[0]},
                )
            else:
                conn.execute(
                    text(
                        "INSERT INTO schema_embeddings (table_name, kind, content, embedding) "
                        "VALUES (:t, :k, :c, :e)"
                    ),
                    {"t": chunk.table, "k": chunk.kind, "c": chunk.content, "e": vec},
                )

    return len(chunks)


async def retrieve(query: str, k: int = 6) -> list[SchemaChunk]:
    """쿼리 임베딩 → pgvector 코사인 top-k 스키마 청크 반환."""
    try:
        query_vec = await embed(query)
    except OllamaError:
        # Ollama 미기동 시 전체 텍스트 매칭 폴백 (테이블명/컬럼명 포함 우선)
        return _fallback_retrieve(query, k)

    with meta_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, kind, content "
                "FROM schema_embeddings "
                "WHERE embedding IS NOT NULL "
                "ORDER BY embedding <=> :v "
                "LIMIT :k"
            ),
            {"v": str(query_vec), "k": k},
        ).fetchall()

    if not rows:
        return _fallback_retrieve(query, k)

    return [SchemaChunk(table=r[0], kind=r[1], content=r[2]) for r in rows]


def _fallback_retrieve(query: str, k: int) -> list[SchemaChunk]:
    """Ollama 미기동 시 텍스트 키워드 폴백 검색."""
    q_lower = query.lower()
    with meta_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, kind, content FROM schema_embeddings "
                "ORDER BY CASE WHEN lower(content) LIKE :q THEN 0 ELSE 1 END, id "
                "LIMIT :k"
            ),
            {"q": f"%{q_lower}%", "k": k},
        ).fetchall()
    return [SchemaChunk(table=r[0], kind=r[1], content=r[2]) for r in rows]
