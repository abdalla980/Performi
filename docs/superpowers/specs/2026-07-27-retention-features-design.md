# Retention Features — Design

## Context

Performi's core loop is single-shot: brief → generate → approve → launch → done. Nothing brings the agency back into the app afterward, and nothing helps the agency prove the tool's value to their own downstream client. This spec covers the near-term retention roadmap agreed on 2026-07-27, right-sized to ship immediately on the existing stack — no new external provider (no email/SMTP), no scheduler/job queue, no `dev.db` migration.

**Already shipped, out of scope here:** the "View live performance in Google Ads / Meta Ads Manager" CTA on `DraftDetailPage.tsx` already exists (`PLATFORM_DASHBOARD_URL`), correctly scoped to the account-level dashboard rather than a precise campaign deep link — Google's Ads API doesn't expose the `ocid` a precise link would need, confirmed via search during this design session; the existing code already has a comment recording that same finding.

## A. Attention feed ("needs attention" notifications)

**What:** a `GET /notifications` endpoint that computes, on request (no background job, no new table), a prioritized list of drafts needing agency action:

- `pending_approval_stale` — status `guardrail_checked` (awaiting agency review), `updated_at` older than 3 days
- `client_pending_stale` — status `approved` (awaiting client), `updated_at` older than 5 days
- `guardrail_blocked` — `has_blocking_flags` true and still `guardrail_checked`
- `launch_failed` — status `failed`

Each item: `{ draftId, clientName, kind, daysStale }`, sorted by `daysStale` descending. Staleness thresholds (3/5 days) are explicit constants in this endpoint, adjustable later — not derived from any config the user needs to set up now.

**Frontend:** a bell icon in the top nav (new `NotificationsMenu` component) with a count badge and a dropdown list linking into each draft. Reuses existing `STATUS_LABELS` and routing; no new page required for v1.

## B. Recurring rebrief CTA

**What:** on `CampaignsPage`, any client whose most recent draft is `launched` with `createdAt` more than 30 days ago gets a "Refresh campaign" action.

**Backend:** none — derivable client-side from the existing `listBriefs()` response, which already includes `createdAt`/`status`/`clientName` per draft.

**Frontend:** `NewBriefPage` gains prefill support via a `?duplicateFrom=<draftId>` query param. On mount, if present, fetch that draft (`apiClient.getBrief`) and prefill all matching fields (business description, budget, goals, website, location, audience, platforms, competitors, USPs, excluded keywords). Submits as a normal new brief for the same client — no new backend endpoint.

## C. Impact stats (time-saved + issues-caught)

**What:** a `GET /stats/impact` endpoint returning agency-wide cumulative figures:

- `campaignsLaunched` — count of drafts with status `launched`
- `estimatedHoursSaved` — `campaignsLaunched × 2` (2 hrs/campaign manual-build assumption; same "transparent benchmark assumption" pattern already used in `projections.py`, explicitly labeled an estimate in the UI, not a measured figure)
- `guardrailIssuesCaught` — sum of `len(flags_json)` across all `GuardrailReport` rows for the agency

**Frontend:** a small "Impact" stat row on `CampaignsPage`, using the existing `StatTile` component.

## D. Branded client summary (shareable one-pager)

**What:** a print-friendly, agency-facing summary view for any draft at `client_approved` or later — composed entirely from data `DraftDetailPage` already fetches (no new backend endpoint), plus the client's logo (`ClientAsset` kind=`logo`) and brand tone (`BrandVoiceProfile.tone`): client name + logo, business description, budget, platforms, headline ad copy from the Google/Meta plans, targeting summary.

Deliberately excludes fields the client-portal boundary already treats as internal-only (guardrail flags, competitors, excluded keywords, unique selling points) — reusing that existing whitelist boundary for consistency, even though this page is agency-facing, not client-facing (the agency prints/screenshots it to send to their client, the client never logs in to see it).

**Frontend only:** new `ClientSummaryView` component + a "Share summary" button on `DraftDetailPage`, opening a print-friendly route (`/campaigns/:draftId/summary`) styled for `window.print()` / screenshot.

## Data model changes

None. All four items read existing tables (`CampaignDraft`, `Approval`, `GuardrailReport`, `ClientAsset`, `BrandVoiceProfile`) through new read-only queries/endpoints. No `dev.db` migration needed.

## Testing

Per this repo's established TDD convention: each backend endpoint gets a route-level test first (confirmed red), then the minimal implementation (confirmed green); each frontend piece gets a component/page test. Full suites (`pytest`, `vitest`, `tsc -b`) must pass before any item is considered done.

## Explicitly out of scope

Flagged in the original roadmap discussion, not forgotten: real performance-reporting pull from the Google/Meta APIs (bigger scope-of-use question given the pending Basic Access application), actual email delivery (this spec substitutes an in-app notification feed, which needs no new external provider), multi-seat/team accounts, usage-based billing.
