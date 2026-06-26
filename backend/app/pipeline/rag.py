"""RAG — 스키마 임베딩/검색. 임베딩은 SQLite BLOB에 저장하고 numpy 코사인으로 top-k — ARCHITECTURE §4.

임베딩 규모가 작아(테이블당 수십~수백 청크) brute-force 코사인으로 충분하다.
ANN 인덱스(pgvector/sqlite-vec)는 수백만 벡터부터 의미가 있어 여기선 과설계다.
"""

from __future__ import annotations

import struct
from typing import Literal

import numpy as np
from pydantic import BaseModel
from sqlalchemy import Engine, inspect, select

from app.db import MetaSession
from app.llm.client import OllamaError, embed
from app.models.rag import SchemaEmbedding


def _pack(vec: list[float]) -> bytes:
    """임베딩을 float32 little-endian BLOB로 직렬화."""
    return struct.pack(f"<{len(vec)}f", *vec)


def _unpack(blob: bytes) -> np.ndarray:
    """BLOB를 float32 numpy 벡터로 역직렬화."""
    return np.frombuffer(blob, dtype="<f4")


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
    """대상 스키마 reflection → 청크화 → 임베딩 → 메타 DB upsert. 처리된 청크 수 반환."""
    from app.db import get_target_engine
    eng = engine or get_target_engine()
    if eng is None:
        # target 미연결 — 색인할 대상 없음
        return 0

    chunks = _reflect_chunks(eng)
    if not chunks:
        return 0

    session = MetaSession()
    try:
        for chunk in chunks:
            try:
                vec = await embed(chunk.content)
            except OllamaError:
                vec = None

            blob = _pack(vec) if vec else None

            # upsert: table_name + kind 기준 (updated_at은 ORM onupdate가 처리)
            existing = session.scalar(
                select(SchemaEmbedding).where(
                    SchemaEmbedding.table_name == chunk.table,
                    SchemaEmbedding.kind == chunk.kind,
                )
            )
            if existing:
                existing.content = chunk.content
                existing.embedding = blob
            else:
                session.add(
                    SchemaEmbedding(
                        table_name=chunk.table,
                        kind=chunk.kind,
                        content=chunk.content,
                        embedding=blob,
                    )
                )
        session.commit()
    finally:
        session.close()

    return len(chunks)


async def retrieve(query: str, k: int = 6) -> list[SchemaChunk]:
    """쿼리 임베딩 → numpy 코사인 top-k 스키마 청크 반환."""
    try:
        query_vec = await embed(query)
    except OllamaError:
        # Ollama 미기동 시 전체 텍스트 매칭 폴백 (테이블명/컬럼명 포함 우선)
        return _fallback_retrieve(query, k)

    session = MetaSession()
    try:
        rows = session.execute(
            select(
                SchemaEmbedding.table_name,
                SchemaEmbedding.kind,
                SchemaEmbedding.content,
                SchemaEmbedding.embedding,
            ).where(SchemaEmbedding.embedding.is_not(None))
        ).all()
    finally:
        session.close()

    if not rows:
        return _fallback_retrieve(query, k)

    # 코사인 유사도 = 정규화 내적. brute-force(규모 작음) — 상위 k개.
    q = np.asarray(query_vec, dtype="<f4")
    q_norm = float(np.linalg.norm(q)) or 1.0
    scored: list[tuple[float, tuple[str, str, str]]] = []
    for table_name, kind, content, blob in rows:
        v = _unpack(blob)
        denom = (float(np.linalg.norm(v)) or 1.0) * q_norm
        sim = float(np.dot(q, v) / denom)
        scored.append((sim, (table_name, kind, content)))

    scored.sort(key=lambda s: s[0], reverse=True)
    return [SchemaChunk(table=t, kind=kd, content=c) for _, (t, kd, c) in scored[:k]]


def _fallback_retrieve(query: str, k: int) -> list[SchemaChunk]:
    """Ollama 미기동 시 텍스트 키워드 폴백 검색."""
    q_lower = query.lower()
    session = MetaSession()
    try:
        rows = session.execute(
            select(SchemaEmbedding.table_name, SchemaEmbedding.kind, SchemaEmbedding.content)
            .order_by(SchemaEmbedding.id)
        ).all()
    finally:
        session.close()
    # 키워드 포함을 우선 정렬(파이썬 측 — DB별 lower/LIKE 차이 회피).
    ranked = sorted(rows, key=lambda r: 0 if q_lower in r[2].lower() else 1)
    return [SchemaChunk(table=r[0], kind=r[1], content=r[2]) for r in ranked[:k]]
