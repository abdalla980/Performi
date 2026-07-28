import uuid
from typing import Literal

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models.agency import Agency
from app.models.brief import CampaignDraft
from app.schemas.generation import GenerateDraftResponse
from app.security import get_current_agency
from app.services.audit import record_audit_event
from app.services.demo_generation import generate_demo_campaign_ir
from app.services.google_adapter import adapt_to_google
from app.services.llm_generation import generate_campaign_ir
from app.services.meta_adapter import adapt_to_meta
from app.services.sitelinks import attach_sitelinks

router = APIRouter(prefix="/briefs", tags=["generation"])


@router.post("/{draft_id}/generate", response_model=GenerateDraftResponse)
def generate_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> GenerateDraftResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    settings = get_settings()
    brand_voice = draft.brief.client.brand_voice_profile
    if settings.anthropic_api_key:
        mode: Literal["live", "demo"] = "live"
        anthropic_client = Anthropic(api_key=settings.anthropic_api_key)
        ir = generate_campaign_ir(draft.brief, anthropic_client=anthropic_client, brand_voice=brand_voice)
    else:
        mode = "demo"
        ir = generate_demo_campaign_ir(draft.brief, brand_voice=brand_voice)

    platforms = draft.brief.platforms
    google_plan = adapt_to_google(ir) if "google" in platforms else None
    if google_plan is not None:
        google_plan = attach_sitelinks(google_plan, brand_voice)
    meta_plan = adapt_to_meta(ir) if "meta" in platforms else None

    draft.ir_json = ir.model_dump(mode="json")
    draft.google_plan_json = google_plan.model_dump(mode="json") if google_plan else None
    draft.meta_plan_json = meta_plan.model_dump(mode="json") if meta_plan else None
    draft.status = "adapted"
    db.commit()

    record_audit_event(
        db,
        agency_id=agency.id,
        client_id=draft.brief.client_id,
        event_type="draft.generated_demo" if mode == "demo" else "draft.generated",
        payload={"draft_id": str(draft.id)},
    )

    return GenerateDraftResponse(
        id=draft.id,
        brief_id=draft.brief_id,
        status=draft.status,
        mode=mode,
        google_plan=google_plan,
        meta_plan=meta_plan,
    )
