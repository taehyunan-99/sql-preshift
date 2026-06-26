"""ORM 모델: SchemaEmbedding — 임베딩을 float32 BLOB로 저장(설치형 SQLite, numpy 코사인)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.base import Base


class SchemaEmbedding(Base):
    __tablename__ = "schema_embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    table_name: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 임베딩 벡터를 float32 little-endian BLOB로 저장. 검색은 numpy 코사인(pipeline/rag.py).
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
