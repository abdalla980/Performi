import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.approval import Approval
from app.models.brief import CampaignDraft
from app.models.guardrail import GuardrailReport
from app.schemas.approval import ActAsClientRequest, ApprovalRequest, ApprovalResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.google_adapter import adapt_to_google
from app.services.meta_adapter import adapt_to_meta
from app.services.sitelinks import attach_sitelinks

router = APIRouter(prefix="/briefs", tags=["approvals"])


@router.post("/{draft_id}/approve", response_model=ApprovalResponse)
def decide_draft(
    draft_id: uuid.UUID,
    body: ApprovalRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ApprovalResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    if body.decision == "approved":
        report = db.scalar(select(GuardrailReport).where(GuardrailReport.campaign_draft_id == draft.id))
        if report is not None and report.has_blocking_flags:
            raise HTTPException(status_code=409, detail="Cannot approve a draft with blocking compliance issues")

        if body.edited_ir is not None:
            draft.ir_json = body.edited_ir.model_dump(mode="json")
            google_plan = adapt_to_google(body.edited_ir)
            google_plan = attach_sitelinks(google_plan, draft.brief.client.brand_voice_profile)
            draft.google_plan_json = google_plan.model_dump(mode="json")
            draft.meta_plan_json = adapt_to_meta(body.edited_ir).model_dump(mode="json")

    approval = Approval(
        campaign_draft_id=draft.id,
        decision=body.decision,
        edited_ir_json=body.edited_ir.model_dump(mode="json") if body.edited_ir else None,
        reviewer_note=body.reviewer_note,
    )
    db.add(approval)
    draft.status = body.decision
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type=f"draft.{body.decision}",
        payload={"draft_id": str(draft.id), "reviewer_note": body.reviewer_note},
    )
    return ApprovalResponse(status=draft.status)


@router.post("/{draft_id}/act-as-client", response_model=ApprovalResponse)
def act_as_client(
    draft_id: uuid.UUID,
    body: ActAsClientRequest,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ApprovalResponse:
    """Demo-only: agency stands in for client portal approval when the client has no
    real (non-demo) ad-account link — same gate as demo generation/launch."""
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != "approved":
        raise HTTPException(status_code=409, detail="Campaign is not awaiting client approval")
    if draft.brief.client.has_real_platform_connection:
        raise HTTPException(
            status_code=409,
            detail="Client review must go through the client portal when a live ad account is linked",
        )

    draft.status = "client_approved" if body.decision == "approved" else "client_rejected"
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type=f"draft.{draft.status}_as_agency",
        payload={"draft_id": str(draft.id)},
    )
    return ApprovalResponse(status=draft.status)
