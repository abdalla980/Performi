# Launched Campaigns Page — Design

## Context & Goal

Today, seeing your launched campaigns means going to the main Campaigns list and manually setting the status filter to "Launched" — and even then, the "manage in Google Ads / Meta" link only exists one level deeper, inside each individual draft's detail page. There's no dedicated view for "here's everything that's live, go do something about it," and no way to remove a launched campaign from Performi's own view once you're done with it.

**Decisions already made (do not re-litigate):**
- "Delete" means **removing it from Performi's list only** — archiving, not touching the real campaign on Google/Meta at all (Performi has no write access for that, by design — see the deletion-guard and campaign-quality-upgrade specs for the same principle applied elsewhere).
- This is a **new, dedicated page**, not just an enhancement bolted onto the existing Campaigns list.

## Current State (reference)

- `frontend/src/pages/CampaignsPage.tsx` — the only existing campaign list, filterable by status via `<Select>`, no inline manage-in-platform links.
- `frontend/src/pages/DraftDetailPage.tsx:275-296` — the only place a "View in {platform}" link currently exists, built via `buildPlatformManageUrl` (`frontend/src/lib/platformLinks.ts`), one link per successful `launch` in `draft.launches`.
- `backend/app/routers/briefs.py:159-175` — `list_briefs` / `_draft_summary` returns `DraftSummaryResponse` — **does not include `launches`** (only `DraftDetailResponse`, the single-draft fetch, has that). This matters: a list view needs each launch's `external_campaign_id` to build a precise per-campaign Meta link, and today only the single-draft endpoint carries that.
- `backend/app/models/brief.py` — `CampaignDraft` has no soft-delete/archive concept at all today.
- `backend/app/routers/clients.py`'s `_find_launched_campaigns` (deletion-guard spec) — queries `CampaignDraft.status == "launched"` for the client-deletion block; needs to stay consistent with whatever "archived" means here.
- `backend/app/routers/stats.py` — `campaigns_launched` counts `CampaignDraft.status == "launched"` for the cumulative impact stat — this must **not** be affected by archiving (the value was still delivered; archiving is about list visibility, not historical accounting).
- `frontend/src/components/AppShell.tsx` — `NAV_ITEMS` array, currently `Campaigns / Clients / Activity / Settings`.

## Target Design

### 1. Archive is a new column, not a delete

```python
# backend/app/models/brief.py — CampaignDraft, add:
archived_at: Mapped[datetime | None] = mapped_column(default=None)
```

No new table, no cascade changes — this is additive, and `client_deletion.py`'s cascade delete is completely unaffected (archived or not, a real client deletion still removes everything, same as today).

### 2. Archived drafts disappear from every list, but never from stats

`list_briefs` (`briefs.py:159-175`) excludes archived drafts by default:

```python
query = (
    select(CampaignDraft)
    .join(Brief, CampaignDraft.brief_id == Brief.id)
    .join(Client, Brief.client_id == Client.id)
    .where(Client.agency_id == agency.id, CampaignDraft.archived_at.is_(None))
    .order_by(CampaignDraft.created_at.desc())
)
```

This one change makes archived campaigns disappear from **both** the existing Campaigns page and the new Launched Campaigns page, since both will read from the same `GET /briefs` — no separate "hidden" logic needed in two places.

**`stats.py` is explicitly NOT changed** — `campaigns_launched`/`guardrail_issues_caught` keep counting every `status == "launched"` draft regardless of `archived_at`. Archiving is about what you see in the list, not what you've cumulatively shipped.

**`clients.py`'s `_find_launched_campaigns`** (deletion guard) should also exclude archived drafts (`CampaignDraft.archived_at.is_(None)`) — if an agency archived a launched campaign, they've indicated they're done with it, and it shouldn't keep blocking client deletion.

### 3. New endpoint: archive a launched campaign

```python
# backend/app/routers/briefs.py
@router.post("/{draft_id}/archive", response_model=DraftSummaryResponse)
def archive_draft(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> DraftSummaryResponse:
    draft = db.get(CampaignDraft, draft_id)
    if draft is None or draft.brief.client.agency_id != agency.id:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status != "launched":
        raise HTTPException(status_code=409, detail="Only launched campaigns can be archived")

    draft.archived_at = datetime.now(timezone.utc)
    db.commit()

    record_audit_event(
        db, agency_id=agency.id, client_id=draft.brief.client_id,
        event_type="draft.archived", payload={"draft_id": str(draft.id)},
    )
    return _draft_summary(draft, _get_report(db, draft.id))
```

Restricted to `status == "launched"` deliberately — this feature exists for the launched-campaigns view specifically; archiving a draft in some other state isn't part of this spec's scope and would need its own thinking about what that even means.

### 4. `DraftSummaryResponse` needs `launches` too

This is the one non-obvious backend change. Today only `DraftDetailResponse` carries `launches: list[PlatformLaunchResult]`. The new list page needs each launch's `external_campaign_id` to build a precise Meta deep link (`buildPlatformManageUrl` already supports this — see `platformLinks.ts:14-16` — it just needs the data).

```python
# schemas/brief.py — add to DraftSummaryResponse:
launches: list[PlatformLaunchResult] = []
```

Fetch these **batched, not per-row**, to avoid an N+1 query across a list endpoint — `list_briefs` gathers all the draft IDs it's about to return, does one `select(LaunchRecord).where(LaunchRecord.campaign_draft_id.in_(draft_ids))`, and groups the results in Python before building each `DraftSummaryResponse`. `_draft_summary` gains an optional `launches: list[LaunchRecord] | None = None` parameter (defaults to empty — `submit_brief`/`submit_briefs_batch` create fresh drafts with nothing to launch yet, so they keep passing nothing).

### 5. New page: `frontend/src/pages/LaunchedCampaignsPage.tsx`

Fetches `apiClient.listBriefs()` (same call `CampaignsPage` already makes — no new API method needed beyond what Section 4 added to the existing response shape), filters client-side to `status === 'launched'`. Table columns: client (name + logo, matching `CampaignsPage`'s existing avatar pattern), budget, launched date, and **one row of platform links per launch** — for each successful launch, a "{PLATFORM_LABEL} ↗" link built via `buildPlatformManageUrl(launch.platform, { externalCampaignId: launch.externalCampaignId, metaAdAccountId: <client's, from the existing client list already fetched> })`, plus an "Archive" button that calls the new endpoint and removes the row (via query invalidation, same `invalidate()` pattern already used elsewhere in this app).

Empty state (no launched campaigns yet, or everything's archived): reuse the existing `EmptyState` component, same pattern as `CampaignsPage`'s empty states.

### 6. Navigation

`AppShell.tsx`'s `NAV_ITEMS`: add `{ to: '/launched', label: 'Launched', icon: Rocket, end: false }` (or a similarly fitting lucide icon — `Rocket` isn't used elsewhere in this app's nav, check for a clash before finalizing). Route added to `AppRoutes.tsx` inside the existing `RequireRole role="agency"` + `AppShell` nesting, same as every other agency page.

## Impact Map

| File | Change |
|---|---|
| `backend/app/models/brief.py` | `CampaignDraft.archived_at` column |
| `backend/app/schemas/brief.py` | `DraftSummaryResponse.launches` field |
| `backend/app/routers/briefs.py` | `list_briefs` excludes archived + batches launches; new `archive_draft` endpoint |
| `backend/app/routers/clients.py` | `_find_launched_campaigns` excludes archived |
| `backend/app/routers/stats.py` | **No change** — explicitly still counts archived launches |
| `frontend/src/lib/types.ts`, `apiClient.http.ts` | `DraftSummary.launches`, new `archiveDraft(draftId)` method |
| `frontend/src/pages/LaunchedCampaignsPage.tsx` | New page |
| `frontend/src/components/AppShell.tsx`, `AppRoutes.tsx` | New nav item + route |

## Migration Notes

One new `campaign_drafts` column — same manual `ALTER TABLE` situation as every prior round in this repo. Check the live `dev.db` directly after implementing (this has been the one recurring gap across these rounds — worth double-checking every time, not assuming it's handled just because recent rounds got it right).

## Testing

Per this repo's TDD convention. Specifically worth covering: archiving a non-launched draft is rejected (409); an archived draft disappears from `GET /briefs` but its data is untouched (re-fetching the single draft via `GET /briefs/{id}` should still work — archiving isn't a delete); `stats.py`'s `campaigns_launched` count is unchanged by archiving; the batched-launches query in `list_briefs` returns the right launches for the right drafts (not cross-contaminated) when multiple drafts each have their own launches.

## Explicitly Out of Scope

- Un-archiving (no "restore" action) — if this turns out to be wanted, it's a small follow-up (clear `archived_at`), not designed here since it wasn't asked for.
- Any real pause/stop of the actual Google/Meta campaign — this spec is list-visibility only, consistent with every prior decision this session about not taking on live campaign management.
- Bulk archive (archive-all button) — one at a time only, matching the granularity of every other action in this app.
