import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def record_audit_event(
    db: Session,
    *,
    agency_id: uuid.UUID,
    event_type: str,
    payload: dict,
    client_id: uuid.UUID | None = None,
) -> AuditLog:
    entry = AuditLog(
        agency_id=agency_id,
        client_id=client_id,
        event_type=event_type,
        payload=payload,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
