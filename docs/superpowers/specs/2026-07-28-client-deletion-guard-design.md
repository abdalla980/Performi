# Client Deletion Guard + Platform Manage CTA — Design

## Context & Goal

`delete_client_cascade` (`backend/app/services/client_deletion.py:17-41`) deletes a client's `GuardrailReport`/`Approval`/`LaunchRecord`/`CampaignDraft`/`Brief`/`ClientAsset`/`BrandVoiceProfile`/`AuditLog` rows, then the `Client` row itself — **purely local database cleanup, zero calls to the Google Ads or Meta API.** Campaigns are always created paused (deliberate safety gate — see `google_ads_client.py`/`meta_ads_client.py`), but once an agency manually activates one in the native platform UI, Performi has no idea it's live and no way to stop it. Deleting that client today doesn't pause anything — it keeps spending, and it's now *harder* to find, because `LaunchRecord.external_campaign_id` (the only thing that identifies the real campaign) and the `AuditLog` trail both get deleted in the same action.

This spec does two things: (1) block deletion by default when a client has a `launched` campaign, surfacing exactly which ones and a direct link to go handle them first; (2) fix the existing "view in native platform" links to be campaign-specific where the platform actually supports it (currently both are account-level only, which is more precise than necessary on Meta's side).

## Current State (reference)

- `backend/app/services/client_deletion.py:17-41` — cascade delete, no external API calls, deletes `LaunchRecord` (holds `external_campaign_id`) and `AuditLog` along with everything else.
- `backend/app/routers/clients.py` — `delete_client` route calls `delete_client_cascade` directly, no pre-check.
- `frontend/src/pages/ClientDetailPage.tsx:76-81,149-168` — delete flow today: plain `window.confirm()`, then `apiClient.deleteClient(clientId)`, error surfaced as raw `error.message` text in an `Alert`. **This page already fetches the client's `campaigns` list** (referenced at line 170, `campaigns && campaigns.length > 0`) — it already has everything needed to check for launched campaigns client-side before the user even clicks delete, no new fetch required.
- `frontend/src/pages/DraftDetailPage.tsx:20-26,289` — `PLATFORM_DASHBOARD_URL` already exists: `{ google: 'https://ads.google.com/aw/overview', meta: 'https://adsmanager.facebook.com/adsmanager/' }`, both account-level. The comment there correctly explains *why* Google is account-level only (no reliable `ocid`-free deep link) — but Meta doesn't have that limitation and is being under-used: `business.facebook.com/adsmanager/manage/campaigns?act=<ad_account_id>&selected_campaign_ids=<campaign_id>` reliably jumps to one specific campaign (verified when this CTA was originally researched).
- `frontend/src/lib/apiClient.http.ts`'s `request()` — throws `new Error(await response.text())` on any non-2xx response, i.e. today's error handling can't distinguish "blocked, here's why" from any other failure without inspecting the raw body.

## Target Design

### 1. Extract and upgrade the platform-link helper

New file: `frontend/src/lib/platformLinks.ts`

```typescript
import type { Platform } from './types'

export function buildPlatformManageUrl(
  platform: Platform,
  options: { externalCampaignId?: string | null; metaAdAccountId?: string | null } = {},
): string {
  if (platform === 'google') {
    // No reliable ocid-free deep link to one specific campaign exists — account-level
    // is the correct, honest choice here, not a shortcut. Do not "improve" this later
    // without re-verifying Google's current deep-link support.
    return 'https://ads.google.com/aw/overview'
  }
  const { externalCampaignId, metaAdAccountId } = options
  if (externalCampaignId && metaAdAccountId && !externalCampaignId.startsWith('demo-')) {
    const account = metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`
    return `https://business.facebook.com/adsmanager/manage/campaigns?act=${account}&selected_campaign_ids=${externalCampaignId}`
  }
  return 'https://adsmanager.facebook.com/adsmanager/'
}

export const PLATFORM_LABEL: Record<Platform, string> = { google: 'Google Ads', meta: 'Meta Ads Manager' }
```

Update `DraftDetailPage.tsx` to import and use this instead of its own inline `PLATFORM_DASHBOARD_URL` — same behavior for Google, campaign-specific now for Meta (needs `client.metaAdAccountId`, already available via the existing client query on that page).

### 2. Backend — block deletion, list what's blocking it

```python
# backend/app/routers/clients.py
@router.delete("/{client_id}")
def delete_client(
    client_id: uuid.UUID,
    force: bool = False,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> dict:
    client = _get_owned_client(db, client_id, agency)

    if not force:
        launched = _find_launched_campaigns(db, client_id)  # see below
        if launched:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "This client has campaigns still marked launched. Pause them in the native platform before deleting, or delete anyway.",
                    "launched_campaigns": launched,
                },
            )

    client_name = client.name
    delete_client_cascade(db, client)
    record_audit_event(db, agency_id=agency.id, client_id=None, event_type="client.deleted", payload={"client_name": client_name})
    return {"status": "deleted"}


def _find_launched_campaigns(db: Session, client_id: uuid.UUID) -> list[dict]:
    """Drafts with status == 'launched' for this client, with each platform's
    external_campaign_id so the frontend can build a direct link to go handle it."""
    drafts = db.scalars(
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .where(Brief.client_id == client_id, CampaignDraft.status == "launched")
    ).all()
    result = []
    for draft in drafts:
        launches = db.scalars(select(LaunchRecord).where(LaunchRecord.campaign_draft_id == draft.id)).all()
        result.append({
            "draft_id": str(draft.id),
            "launches": [
                {"platform": l.platform, "external_campaign_id": l.external_campaign_id}
                for l in launches if l.status == "success"
            ],
        })
    return result
```

`force=true` is the explicit override — same shape as any "are you sure" confirmation, just expressed as a query param so it's a single extra fetch call, not a second endpoint.

### 3. Frontend — check before confirming, not after failing

`ClientDetailPage.tsx`'s delete handler changes from a single `window.confirm()` to:

```tsx
const launchedCampaigns = campaigns?.filter((c) => c.status === 'launched') ?? []

// ...in the delete button's onClick:
if (launchedCampaigns.length === 0) {
  if (window.confirm(`Delete ${client.name}? This removes all of their briefs, campaigns, and history.`)) {
    deleteClientMutation.mutate({ force: false })
  }
  return
}
setShowLaunchedWarning(true)  // open the panel below instead of window.confirm
```

New inline panel (shown only when `launchedCampaigns.length > 0`, matching this app's existing `Alert`/`Card` idioms, not a browser `confirm()` — there's real content to show, not just a yes/no):

```
"N campaign(s) for this client are still marked launched. Deleting will not pause them — they'll keep running until you stop them in the platform itself."

[per launched campaign, per platform]: "Acme Bakery — Google Ads" [Manage in Google Ads ↗]  (buildPlatformManageUrl)

[Delete anyway] (calls deleteClientMutation.mutate({ force: true }))   [Cancel]
```

`apiClient.deleteClient` signature changes from `(clientId: string) => Promise<void>` to `(clientId: string, options?: { force?: boolean }) => Promise<void>`, passing `?force=true` on the query string when set. `fakeApiClient.ts`/`apiClient.http.test.ts` need the matching update.

## Impact Map

| File | Change |
|---|---|
| `backend/app/routers/clients.py` | `delete_client` gains `force` param + pre-check; new `_find_launched_campaigns` helper |
| `frontend/src/lib/platformLinks.ts` | New — extracted + Meta campaign-specific deep link |
| `frontend/src/pages/DraftDetailPage.tsx` | Use the new shared helper instead of inline `PLATFORM_DASHBOARD_URL` |
| `frontend/src/pages/ClientDetailPage.tsx` | Pre-check `campaigns` for `launched` status; new warning panel; delete mutation gains `force` |
| `frontend/src/lib/apiClient.http.ts`, `types.ts`, `fakeApiClient.ts` | `deleteClient(clientId, { force })` |

## Testing

Per this repo's TDD convention. Specifically: a client with a launched campaign gets 409 with the campaign list on plain delete, succeeds with `force=true`; a client with no launched campaigns (or only `rejected`/`failed`/never-launched ones) deletes on the first try exactly as today, no behavior change for the common case.

## Explicitly Out of Scope

- Actually pausing the campaign via API — this spec is the guard + the link to go do it manually, consistent with this app's existing "generate and launch, don't manage" scope (see the campaign-quality-upgrade and agency-manager-account specs for the same principle applied elsewhere).
- Any change to what `client_deletion.py`'s cascade itself deletes — the guard sits in front of it; once past the guard (or forced), deletion behavior is unchanged.
