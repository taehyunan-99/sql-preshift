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

    # apply 행만 반환한다. rollback 이벤트 행은 목록에서 제외하고,
    # 각 apply의 rolledBack은 "같은 migration_id에 rollback 이벤트가 존재하는가"로 계산한다.
    logs = (
        session.query(AuditLog)
        .filter(AuditLog.action == "apply")
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )

    # migration_id별 rollback 존재 여부를 한 번의 쿼리로 set에 모아 N+1 회피.
    rolled_back_ids = {
        mid
        for (mid,) in session.query(AuditLog.migration_id)
        .filter(AuditLog.action == "rollback")
        .distinct()
        .all()
        if mid is not None
    }

    entries = []
    for log in logs:
        migration = session.get(MigrationHistory, log.migration_id) if log.migration_id else None
        sql = migration.sql if migration else ""
        applied_at = log.created_at.isoformat() if log.created_at else ""
        rolled_back = log.migration_id in rolled_back_ids
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
    # apply/apply-all과 대칭 가드 — target 미연결 시 None이면 executor 폴백이
    # meta_engine을 잡아 롤백 DDL이 메타 DB에서 실행되므로 여기서 차단(메타 DB 오염 방지).
    engine = get_target_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="Database not connected.")
    try:
        # target_engine 명시 전달 — 미전달 시 session.get_bind()가 meta_engine을
        # 잡아 롤백 SQL이 메타 DB에서 실행되는 버그 방지(실제 대상 DB 원복 보장).
        result = rollback(audit_id, session, target_engine=engine)
        session.commit()
        return result
    except ValidationError as e:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Rollback failed: {e}")
