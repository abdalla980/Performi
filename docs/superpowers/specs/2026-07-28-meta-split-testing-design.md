# Meta Split Testing — Design

## Context & Goal

The campaign-quality upgrade (already implemented) made every Meta campaign generate 2-3 audience segments, each becoming its own ad set. Today those ad sets just run in parallel — nothing stops their audiences from overlapping, nothing splits budget for statistical validity, and there's no significance reporting on which segment actually performed better. Meta has a real, purpose-built feature for exactly this: **Split Testing**, via the `ad_studies` API. Since the multi-segment structure this app already generates is precisely what a split test needs as input, registering it as a formal test is a small addition on top of already-working code, not a new subsystem.

**Hard limit worth stating up front:** this app deliberately does not pull reporting/performance data back from either platform (see the Basic Access application: "we do not call GoogleAdsService for reporting/search," and the equivalent stance on Meta). Registering a split test is something Performi *can* do (it's a creation call, same category as everything else this app already does). **Showing who won is not** — that requires reading results back, which is out of scope here same as everywhere else in this app. The agency checks results natively in Meta Ads Manager, same as they already do for spend/performance.

## Current State (reference)

- `backend/app/services/meta_ads_client.py` — `RealMetaAdsPushClient.push()` creates one `Campaign`, then loops `plan.ad_sets` creating one `AdSet` + N `AdCreative`/`Ad` pairs each (from the campaign-quality upgrade). Returns `campaign_id`.
- `backend/app/models/agency.py` — has `meta_access_token_encrypted` (agency-wide Meta connection, from the agency-manager-account redesign) but **no Business Manager ID stored anywhere.** Split testing needs one — `ad_studies` is created at `/{business_id}/ad_studies`, a Business-level endpoint, not an ad-account-level one.
- Verified via Meta's own API reference (`developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study`, `.../guides/split-testing`): the raw Graph API is confirmed — `POST /{business_id}/ad_studies` with `type=SPLIT_TEST`, `cells=[{name, treatment_percentage, adsets:[<AD_SET_ID>,...]}, ...]` (ad-set-based cells — exactly matches this app's one-campaign-many-ad-sets structure), plus `start_time`/`end_time` as unix timestamps. **Not verified:** the exact `facebook-business` Python SDK (`facebook_business.adobjects.business.Business`) method name/signature for this call — `create_ad_study(params={...})` below follows this SDK's existing naming convention (`create_campaign`, `create_ad_set`, etc., already used elsewhere in this same file) but should be confirmed against the installed SDK version before implementing, same caveat as the Google Ads Asset API in the campaign-quality-upgrade spec.

## Target Design

### 1. Agency needs a Meta Business Manager ID

```python
# backend/app/models/agency.py — add:
meta_business_id: Mapped[str | None] = mapped_column(String(64), default=None)
```

Same manual-entry pattern already established for `google_ads_login_customer_id` (agency-manager-account spec): a field in Settings, next to the Meta connect button, no auto-discovery. Add `PUT /agency/meta/business-account` (mirrors `PUT /agency/google/manager-account`) gated the same way (409 if `meta_access_token_encrypted` isn't set yet).

### 2. Register the split test after a successful multi-segment push

In `meta_ads_client.py`, after the existing ad-set/creative/ad creation loop completes successfully:

```python
def _register_split_test(account, business_id: str, campaign_name: str, ad_set_ids: list[str]) -> str | None:
    """Best-effort: a failure here does not fail the launch — the campaign and ad
    sets are already live (paused) at this point regardless."""
    if len(ad_set_ids) < 2 or not business_id:
        return None
    from facebook_business.adobjects.business import Business
    import time

    share = round(100 / len(ad_set_ids))
    cells = [
        {"name": f"Group {chr(65 + i)}", "treatment_percentage": share, "adsets": [ad_set_id]}
        for i, ad_set_id in enumerate(ad_set_ids)
    ]
    now = int(time.time())
    try:
        study = Business(business_id).create_ad_study(
            params={
                "name": campaign_name,
                "description": f"Auto-generated audience split test for {campaign_name}",
                "type": "SPLIT_TEST",
                "cells": cells,
                "start_time": now,
                "end_time": now + 14 * 86400,  # 14-day default window — reasonable starting point, not a Meta-mandated minimum; make configurable later if it needs tuning
            }
        )
        return study.get("id")
    except Exception:
        return None
```

Call this from `push()` after the ad-set loop, passing the `business_id` from the agency's stored `meta_business_id` and the list of `adset_id`s just created. If it returns an ID, record it via the audit log (`event_type="draft.meta_split_test_registered", payload={"ad_study_id": ...}`) — no new DB column needed, this is a one-time launch-side-effect worth a trail, not something the app needs to query back later.

**Skip silently, don't error, when:** only one ad set exists (nothing to split test), or `meta_business_id` isn't configured — this is a launch-time enhancement layered on top of a push that already succeeds without it, never a reason to fail the launch itself.

### 3. Real open question — verify before relying on this

Campaigns and ad sets are created `PAUSED` by deliberate design (the existing manual-activation safety gate). **It's not verified here whether Meta's split-test scheduling (`start_time`) auto-activates the referenced ad sets when the test window opens, independent of their own paused status.** If it does, registering a split test could silently bypass the safety gate this app has always relied on. Before trusting this in production: create one test split test against a real sandbox ad account with paused ad sets, and confirm they stay paused (or don't) when `start_time` arrives. If Meta does auto-activate them, either push `start_time` further out by default (giving the agency a window to manually activate first) or don't auto-register the split test at all — surface it as an agency-triggered action instead ("Set up split test" button) rather than automatic on every multi-segment launch.

## Impact Map

| File | Change |
|---|---|
| `backend/app/models/agency.py` | `meta_business_id` field |
| `backend/app/routers/agency_connect.py` | `PUT /agency/meta/business-account` |
| `backend/app/schemas/agency_connect.py` | Matching request schema |
| `backend/app/services/meta_ads_client.py` | `_register_split_test`, called after the existing ad-set loop |
| `frontend/src/pages/SettingsPage.tsx` | Input for the Business Manager ID, same shape as the existing manager-ID field |

## Migration Notes

One new `agencies` column — same manual `ALTER TABLE` situation as every prior round in this repo. Check the live `dev.db` directly after implementing.

## Testing

Per this repo's TDD convention. `RealMetaAdsPushClient` isn't exercised by the fast suite (same as always — monkeypatch `FacebookAdsApi.init`/`Business.create_ad_study` while still constructing real SDK message shapes, extending `test_meta_ads_client.py`'s existing pattern). Specifically worth covering: split test is registered when 2+ ad sets exist and `meta_business_id` is set; skipped (not errored) when either condition is false; a `create_ad_study` failure doesn't fail the overall push (the campaign/ad sets it already created stay recorded as a successful launch).

## Explicitly Out of Scope

- Reading back or displaying split test results — agency checks natively in Meta Ads Manager, per the hard limit stated above.
- Google-side experiments (Campaign Drafts & Experiments) — Google's RSAs already self-test headline/description combinations; the heavier campaign-level experiment feature is a separate, bigger feature not covered here.
- Any UI surfacing "this campaign has an active split test" beyond the audit log entry — no new status/badge system, consistent with this app not tracking post-launch platform state anywhere else.
