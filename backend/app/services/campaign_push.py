import time
import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.encryption import decrypt_token
from app.models.brief import CampaignDraft
from app.models.launch import LaunchRecord
from app.schemas.google_plan import GoogleCampaignPlan
from app.schemas.meta_plan import MetaCampaignPlan
from app.services.audit import record_audit_event
from app.services.google_ads_client import GoogleAdsPushPort
from app.services.meta_ads_client import MetaAdsPushPort

_MAX_ATTEMPTS = 3
_BACKOFF_SECONDS = 2


def _push_with_retry(push_fn: Callable[[], str], sleep_fn: Callable[[float], None]) -> tuple[str | None, str | None]:
    errors: list[str] = []
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return push_fn(), None
        except Exception as exc:  # noqa: BLE001 — recorded per-platform, not re-raised
            message = str(exc)
            if message not in errors:
                errors.append(message)
            if attempt < _MAX_ATTEMPTS:
                sleep_fn(_BACKOFF_SECONDS * attempt)
    # A partial first attempt can make later retries fail for a different reason, so
    # keep every distinct error, first (the original cause) first.
    return None, "\n\n".join(f"Attempt error: {e}" for e in errors)


def push_draft_with_clients(
    db: Session,
    draft_id: uuid.UUID,
    google_client: GoogleAdsPushPort,
    meta_client: MetaAdsPushPort,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> list[LaunchRecord]:
    """Pushes a generated draft to every platform the client has linked under the
    agency's manager credentials. Each platform is attempted independently (with
    retry) and recorded as its own LaunchRecord."""
    draft = db.get(CampaignDraft, draft_id)
    client_row = draft.brief.client
    agency = client_row.agency
    records: list[LaunchRecord] = []

    if (
        agency.google_ads_refresh_token_encrypted
        and agency.google_ads_login_customer_id
        and client_row.google_ads_customer_id
        and draft.google_plan_json
    ):
        plan = GoogleCampaignPlan.model_validate(draft.google_plan_json)
        refresh_token = decrypt_token(agency.google_ads_refresh_token_encrypted)
        login_customer_id = agency.google_ads_login_customer_id
        customer_id = client_row.google_ads_customer_id
        external_id, error = _push_with_retry(
            lambda: google_client.push(plan, refresh_token, login_customer_id, customer_id),
            sleep_fn,
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

    if agency.meta_access_token_encrypted and client_row.meta_ad_account_id and draft.meta_plan_json:
        plan = MetaCampaignPlan.model_validate(draft.meta_plan_json)
        access_token = decrypt_token(agency.meta_access_token_encrypted)
        ad_account_id = client_row.meta_ad_account_id
        business_id = agency.meta_business_id
        external_id, error = _push_with_retry(
            lambda: meta_client.push(plan, access_token, ad_account_id, business_id=business_id),
            sleep_fn,
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

    study_id = getattr(meta_client, "last_ad_study_id", None)
    if study_id and any(r.platform == "meta" and r.status == "success" for r in records):
        record_audit_event(
            db,
            agency_id=agency.id,
            client_id=client_row.id,
            event_type="draft.meta_split_test_registered",
            payload={"draft_id": str(draft.id), "ad_study_id": study_id},
        )

    return records
