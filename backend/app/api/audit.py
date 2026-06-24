"""GET /api/audit, POST /api/audit/{id}/rollback."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_meta_session, get_target_engine
from app.pipeline.executor import rollback
from app.pipeline.validation import ValidationError
from app.schemas.analysis import AuditEntry, RollbackResult

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditEntry])
async def list_audit(
    limit: int = 50,
    session: Session = Depends(get_meta_session),
):
    """적용 이력을 최신순으로 반환한다. #6: §5 계약 키 id/sql/appliedAt/rolledBack."""
    from app.models.audit import AuditLog, MigrationHistory

    logs = (
        session.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    entries = []
    for log in logs:
        migration = session.get(MigrationHistory, log.migration_id) if log.migration_id else None
        sql = migration.sql if migration else ""
        applied_at = log.created_at.isoformat() if log.created_at else ""
        rolled_back = log.action == "rollback"
        entries.append(
            AuditEntry(
                id=str(log.id),
                sql=sql,
                appliedAt=applied_at,
                rolledBack=rolled_back,
            )
        )
    return entries


@router.post("/{audit_id}/rollback", response_model=RollbackResult)
async def api_rollback(
    audit_id: int,
    session: Session = Depends(get_meta_session),
):
    """저장된 down 스크립트로 롤백한다."""
    try:
        # target_engine 명시 전달 — 미전달 시 session.get_bind()가 meta_engine을
        # 잡아 롤백 SQL이 메타 DB에서 실행되는 버그 방지(실제 대상 DB 원복 보장).
        result = rollback(audit_id, session, target_engine=get_target_engine())
        session.commit()
        return result
    except ValidationError as e:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Rollback failed: {e}")
