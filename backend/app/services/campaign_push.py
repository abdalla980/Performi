import time
import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.encryption import decrypt_token
from app.models.brief import CampaignDraft
from app.models.launch import LaunchRecord
from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.meta_plan import MetaCampaignPlan
from app.services.google_ads_client import GoogleAdsPushPort
from app.services.meta_ads_client import MetaAdsPushPort

_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = 2


def _push_with_retry(push_fn: Callable[[], str], sleep_fn: Callable[[float], None]) -> tuple[str | None, str | None]:
    last_error: str | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return push_fn(), None
        except Exception as exc:  # noqa: BLE001 — recorded per-platform, not re-raised
            last_error = str(exc)
            if attempt < _MAX_ATTEMPTS:
                sleep_fn(_BACKOFF_SECONDS * attempt)
    return None, last_error


def push_draft_with_clients(
    db: Session,
    draft_id: uuid.UUID,
    google_client: GoogleAdsPushPort,
    meta_client: MetaAdsPushPort,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> list[LaunchRecord]:
    """Pushes a generated draft to every platform the client has connected. Each
    platform is attempted independently (with retry) and recorded as its own
    LaunchRecord, so one platform failing does not affect the other's result."""
    draft = db.get(CampaignDraft, draft_id)
    client_row = draft.brief.client
    records: list[LaunchRecord] = []

    if client_row.google_refresh_token_encrypted and draft.google_plan_json:
        plan = GoogleCampaignPlan.model_validate(draft.google_plan_json)
        refresh_token = decrypt_token(client_row.google_refresh_token_encrypted)
        external_id, error = _push_with_retry(
            lambda: google_client.push(plan, refresh_token, client_row.google_ads_customer_id), sleep_fn
        )
        records.append(
            LaunchRecord(
                campaign_draft_id=draft.id,
                platform="google",
                status="success" if error is None else "failed",
                external_campaign_id=external_id,
                error_message=error,
            )
        )

    if client_row.meta_access_token_encrypted and draft.meta_plan_json:
        plan = MetaCampaignPlan.model_validate(draft.meta_plan_json)
        access_token = decrypt_token(client_row.meta_access_token_encrypted)
        external_id, error = _push_with_retry(
            lambda: meta_client.push(plan, access_token, client_row.meta_ad_account_id), sleep_fn
        )
        records.append(
            LaunchRecord(
                campaign_draft_id=draft.id,
                platform="meta",
                status="success" if error is None else "failed",
                external_campaign_id=external_id,
                error_message=error,
            )
        )

    db.add_all(records)
    draft.status = "launched" if any(r.status == "success" for r in records) else "failed"
    db.commit()
    for record in records:
        db.refresh(record)
    return records
