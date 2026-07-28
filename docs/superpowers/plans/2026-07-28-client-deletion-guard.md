# Client Deletion Guard + Platform Manage CTA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block client deletion when launched campaigns exist (with force override + manage links), and deep-link Meta manage CTAs to the specific campaign.

**Architecture:** Backend `DELETE /clients/{id}?force=` returns 409 + launched campaign list unless forced. Frontend pre-checks local `campaigns` list, shows a warning panel with per-platform manage links. Shared `buildPlatformManageUrl` extracts DraftDetail links and makes Meta campaign-specific.

**Tech Stack:** FastAPI, React, existing `delete_client_cascade` (unchanged).

**Spec:** `docs/superpowers/specs/2026-07-28-client-deletion-guard-design.md`

## Global Constraints

- Do **not** call Google/Meta APIs to pause campaigns — guard + link only.
- Do **not** change `client_deletion.py` cascade contents.
- Google manage URL stays account-level (no reliable ocid-free deep link).
- Meta deep link only when `externalCampaignId` + `metaAdAccountId` present and not `demo-*`.
- Client with no launched drafts deletes exactly as today (`force` unused).

---

## File Structure

```
frontend/src/lib/platformLinks.ts          # NEW
frontend/src/pages/DraftDetailPage.tsx
frontend/src/pages/ClientDetailPage.tsx
frontend/src/lib/apiClient.http.ts / types.ts / fakeApiClient.ts
backend/app/routers/clients.py
backend/tests/test_client_delete.py
frontend tests: ClientDetailPage, DraftDetailPage, apiClient, platformLinks
```

---

### Task 1: `platformLinks` + DraftDetailPage

- Create helper per spec; unit-test Google/Meta/demo fallbacks.
- Replace `PLATFORM_DASHBOARD_URL` in DraftDetailPage; pass `externalCampaignId` + client's `metaAdAccountId`.

### Task 2: Backend delete guard

- `_find_launched_campaigns`; `force: bool = False` query param; 409 detail shape per spec.
- Tests: 409 with list; `?force=true` succeeds; no-launched deletes normally.

### Task 3: Frontend delete UX + apiClient

- `deleteClient(id, { force? })` → `?force=true`.
- ClientDetailPage: empty launched → confirm+delete; else warning panel with manage links + Delete anyway / Cancel.

### Task 4: Suites green + commit

`feat: guard client deletion when campaigns are still launched`

---

## Self-Review

Spec coverage: platform helper ✓, Meta deep link ✓, 409+force ✓, frontend pre-check panel ✓, cascade untouched ✓. Out of scope (API pause) left out ✓.
