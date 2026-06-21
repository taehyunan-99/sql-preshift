"""initial app meta tables

Revision ID: 0001
Revises:
Create Date: 2026-06-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pgvector 확장 활성화
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 마이그레이션 이력 (적용된 SQL + down 스크립트)
    op.create_table(
        "migration_history",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("sql", sa.Text, nullable=False),
        sa.Column("down_script", sa.Text, nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # 감사 로그 (적용 이벤트)
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("migration_id", sa.Integer, sa.ForeignKey("migration_history.id"), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # 스키마 임베딩 (RAG — M6에서 채움)
    op.create_table(
        "schema_embeddings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("table_name", sa.String(256), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        # vector(1536) 컬럼은 M6에서 pgvector DDL로 ALTER 추가
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("schema_embeddings")
    op.drop_table("audit_log")
    op.drop_table("migration_history")
