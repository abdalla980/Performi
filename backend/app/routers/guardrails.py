import uuid

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.models.guardrail import GuardrailReport
from app.schemas.campaign_ir import CampaignIR
from app.schemas.guardrail import GuardrailFlag, GuardrailReportResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.guardrails import run_rule_checks, run_semantic_check

router = APIRouter(prefix="/briefs", tags=["guardrails"])


@router.post("/{draft_id}/guardrails/run", response_model=GuardrailReportResponse)
def run_guardrails(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> GuardrailReportResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.ir_json is None:
        raise HTTPException(status_code=400, detail="Draft has not been generated yet")

    ir = CampaignIR.model_validate(draft.ir_json)
    brand_voice = draft.brief.client.brand_voice_profile
    settings = get_settings()

    flags = run_rule_checks(ir, brand_voice, brief=draft.brief)
    if settings.anthropic_api_key:
        anthropic_client = Anthropic(api_key=settings.anthropic_api_key)
        flags += run_semantic_check(ir, brand_voice, anthropic_client=anthropic_client)

    report = GuardrailReport(
        campaign_draft_id=draft.id,
        flags_json=[f.model_dump() for f in flags],
        has_blocking_flags=any(f.severity == "block" for f in flags),
    )
    db.add(report)
    draft.status = "guardrail_checked"
    db.commit()
    db.refresh(report)

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type="draft.guardrails_run",
        payload={"draft_id": str(draft.id), "flag_count": len(flags)},
    )
    # Built explicitly: GuardrailReport's column is `flags_json`, not `flags`, so
    # response_model's from_attributes conversion would not find a matching attribute.
    return GuardrailReportResponse(
        id=report.id,
        campaign_draft_id=report.campaign_draft_id,
        flags=[GuardrailFlag.model_validate(f) for f in report.flags_json],
        has_blocking_flags=report.has_blocking_flags,
    )
