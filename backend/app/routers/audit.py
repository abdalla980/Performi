from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogEntryResponse
from app.security import get_current_agency

router = APIRouter(prefix="/audit-log", tags=["audit"])


@router.get("", response_model=list[AuditLogEntryResponse])
def list_audit_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[AuditLog]:
    return db.scalars(
        select(AuditLog)
        .where(AuditLog.agency_id == agency.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()
