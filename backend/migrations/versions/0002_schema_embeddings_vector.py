"""schema_embeddings에 vector 컬럼 추가 (M6 RAG)

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # embedding 컬럼 추가 — 차원은 설정(embedding_dim)에서 읽어 임베딩 모델과 일치시킨다.
    from app.config import settings

    dim = settings.embedding_dim
    op.execute(f"ALTER TABLE schema_embeddings ADD COLUMN IF NOT EXISTS embedding vector({dim})")
    # 코사인 검색용 HNSW 인덱스
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_schema_embeddings_embedding "
        "ON schema_embeddings USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_schema_embeddings_embedding")
    op.execute("ALTER TABLE schema_embeddings DROP COLUMN IF EXISTS embedding")
