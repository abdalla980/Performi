# Meta Split Testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a multi-ad-set Meta push, best-effort register a Meta Split Test (`ad_studies`) when the agency has a Business Manager ID — without failing the launch if registration fails or is skipped.

**Architecture:** Store `Agency.meta_business_id` (Settings + `PUT /agency/meta/business-account`). Thread optional `business_id` into `MetaAdsPushPort.push`. After creating ad sets, call `Business.create_ad_study` (confirmed on installed SDK). Skip when &lt;2 ad sets or no business ID; swallow exceptions. Audit `draft.meta_split_test_registered` on success.

**Tech Stack:** `facebook-business` SDK `Business.create_ad_study`, existing agency connect + Meta push patterns.

**Spec:** `docs/superpowers/specs/2026-07-28-meta-split-testing-design.md`

## Global Constraints

- Split-test registration is **best-effort** — never fail an otherwise successful push.
- Skip silently if `len(ad_set_ids) < 2` or `business_id` missing.
- Do **not** read or display split-test results.
- Manual `ALTER TABLE agencies ADD COLUMN meta_business_id` on live `dev.db`.
- **Open question (spec):** Meta may auto-activate paused ad sets when a split test `start_time` arrives. Implement as specified with a code comment; production trust requires sandbox verification. Fallback if confirmed unsafe: agency-triggered button (out of this commit's automatic path — document only).

---

## File Structure

```
backend/app/models/agency.py
backend/app/schemas/agency_connect.py
backend/app/routers/agency_connect.py
backend/app/services/meta_ads_client.py
backend/app/services/campaign_push.py      # pass business_id; audit study id
frontend/src/pages/SettingsPage.tsx
frontend apiClient + types
tests: test_meta_ads_client, test_oauth_route (business-account), test_campaign_push if needed
```

---

### Task 1: Agency `meta_business_id` + Settings API/UI

- Model column; `MetaBusinessAccountRequest`; `PUT /agency/meta/business-account` (409 without Meta token).
- Settings input mirroring Google manager ID.
- ALTER live `dev.db`.

### Task 2: Register split test in Meta push

- `push(..., business_id: str | None = None)`; collect `adset_id`s; `_register_split_test`.
- Equal `treatment_percentage` shares; 14-day window; set `last_ad_study_id` on client for audit.
- DemoAware/Fake: accept `business_id`, ignore for fake/demo.
- `campaign_push` passes `agency.meta_business_id`; audits when `last_ad_study_id` set.

### Task 3: Tests

- Registers when 2+ ad sets + business_id (mock `Business.create_ad_study`).
- Skips when 1 ad set or no business_id.
- `create_ad_study` raising does not fail push.
- Business-account PUT 409/success.

### Task 4: Suites green + commit

`feat: register Meta split tests for multi-segment launches`

---

## Self-Review

Spec coverage: business ID ✓, post-push study ✓, skip/best-effort ✓, Settings ✓, ALTER ✓, open-question comment ✓. Results UI out of scope ✓.
