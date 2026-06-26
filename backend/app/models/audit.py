"""ORM 모델: MigrationHistory, AuditLog — M0 마이그레이션과 매핑."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.base import Base


class MigrationHistory(Base):
    __tablename__ = "migration_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sql: Mapped[str] = mapped_column(Text, nullable=False)
    down_script: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    audit_logs: Mapped[list[AuditLog]] = relationship("AuditLog", back_populates="migration")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    migration_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("migration_history.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    migration: Mapped[Optional[MigrationHistory]] = relationship(
        "MigrationHistory", back_populates="audit_logs"
    )
