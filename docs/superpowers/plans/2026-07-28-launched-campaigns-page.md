# Launched Campaigns Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dedicated `/launched` page listing every non-archived launched campaign with per-platform manage links and an archive action (Performi-list only).

**Architecture:** Soft-archive via `CampaignDraft.archived_at`. `GET /briefs` excludes archived drafts and batches `launches` onto `DraftSummaryResponse`. New `POST /briefs/{id}/archive`. Frontend filters `listBriefs()` to `launched` and uses existing `buildPlatformManageUrl` + client list for Meta ad-account IDs.

**Tech Stack:** FastAPI, React Query, existing Table/EmptyState/AppShell patterns.

**Spec:** `docs/superpowers/specs/2026-07-28-launched-campaigns-page-design.md`

## Global Constraints

- Archive = list visibility only — never pause/stop Google/Meta campaigns.
- `stats.py` must **not** exclude archived drafts from `campaigns_launched`.
- Deletion guard `_find_launched_campaigns` **must** exclude archived drafts.
- Archive only when `status == "launched"` (409 otherwise).
- Manual `ALTER TABLE campaign_drafts ADD COLUMN archived_at DATETIME` on live `dev.db`.
- No un-archive / bulk archive in this commit.

---

## File Structure

```
backend/app/models/brief.py
backend/app/schemas/brief.py
backend/app/routers/briefs.py
backend/app/routers/clients.py
frontend/src/lib/types.ts / apiClient.http.ts / fakeApiClient.ts
frontend/src/pages/LaunchedCampaignsPage.tsx (+ test)
frontend/src/components/AppShell.tsx
frontend/src/AppRoutes.tsx
backend/tests: test_briefs.py, test_stats.py, test_client_delete.py
```

---

### Task 1: Model + archive endpoint + list changes

- Add `archived_at` to `CampaignDraft`.
- `DraftSummaryResponse.launches`; `_draft_summary(..., launches=None)`.
- `list_briefs`: filter `archived_at.is_(None)`; batch-load LaunchRecords by draft IDs.
- `POST /{draft_id}/archive` per spec.
- `_find_launched_campaigns`: also require `archived_at.is_(None)`.
- ALTER `dev.db`.

### Task 2: Frontend page + API client

- `DraftSummary.launches` (default `[]`); map in `toDraftSummary`.
- `archiveDraft(draftId)` → `POST /briefs/{id}/archive`.
- `LaunchedCampaignsPage`: filter launched; table with manage links + Archive; EmptyState.
- Nav `Rocket` → `/launched`; route in `AppRoutes`.

### Task 3: Tests + commit

- Archive 409 for non-launched; archived hidden from list, still gettable by id; stats unchanged; batched launches not cross-contaminated; deletion guard ignores archived.
- Frontend page test: shows manage links, archive removes row.
- Commit: `feat: add launched campaigns page with archive and manage links`

---

## Self-Review

Spec coverage: archived_at ✓, list exclude ✓, stats untouched ✓, deletion-guard exclude ✓, archive endpoint ✓, summary launches batched ✓, page + nav ✓, ALTER ✓. Un-archive/bulk/API pause out of scope ✓.
