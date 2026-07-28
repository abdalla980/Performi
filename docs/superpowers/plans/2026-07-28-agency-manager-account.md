# Agency-Level Manager Account Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-client Google/Meta OAuth with a single agency-wide Manager Account / Business Manager connection in Settings; each client is linked only by pasting an already-granted Customer ID / Ad Account ID.

**Architecture:** Move encrypted OAuth tokens (and Google `login_customer_id`) onto `Agency`. Keep `Client.google_ads_customer_id` / `meta_ad_account_id` as link targets. New `/agency/*/oauth/*` routes reuse existing `google_oauth` / `meta_oauth` helpers with `state=agency.id`. Push/launch gates become two-part (agency connected **and** client linked). Google Ads SDK gains `login_customer_id`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Fernet token encryption, existing `google_oauth`/`meta_oauth`, React + TanStack Query (existing SPA).

**Spec:** `docs/superpowers/specs/2026-07-28-agency-manager-account-design.md`

## Global Constraints

- This **replaces** per-client OAuth — delete client oauth start/callback routes and frontend `getGoogleOAuthUrl(clientId)` / `getMetaOAuthUrl(clientId)`. Do not keep a fallback.
- **Do not** call Google/Meta APIs to send link invites (manual paste only).
- **Do not** implement verify-on-save (spec enhancement, out of v1).
- Leave unused `clients.google_refresh_token_encrypted` / `meta_access_token_encrypted` **columns in SQLite**; only remove them from the SQLAlchemy `Client` model.
- New agency columns require a **manual `ALTER TABLE` on live `dev.db`** (no migration tool). Document and run after code lands.
- Register new redirect URIs (`/agency/google/oauth/callback`, `/agency/meta/oauth/callback`) in Google/Meta dashboards **and** update `.env` **before** relying on the new connect flow. Update `.env.example` in-repo.
- `/config/status` becomes per-agency connection state (intentional). Demo banner will reappear until the agency reconnects — not a regression.
- Demo-connect must still leave launches workable: after tokens move to `Agency`, demo-connect stamps **agency** demo tokens (+ a demo `login_customer_id` for Google) and only the client target IDs. Spec said “logic does not need to change”; adapt the write targets so the pilot path still works.
- Out of scope: Meta System Users, `ListAccessibleCustomers` auto-discovery, client-portal auth.

---

## File Structure

```
backend/app/models/agency.py                 # + token + login_customer_id columns
backend/app/models/client.py                 # - token fields from ORM
backend/app/routers/agency_connect.py        # NEW agency OAuth + manager-account PUT
backend/app/routers/clients.py               # remove client OAuth; gate ad-account on agency; connected= linked
backend/app/routers/config.py                # per-agency configured flags
backend/app/routers/launches.py              # two-part ready checks
backend/app/services/campaign_push.py        # tokens from agency; google push gets login_customer_id
backend/app/services/google_ads_client.py    # push(..., login_customer_id, customer_id)
backend/app/schemas/agency_connect.py        # NEW ManagerAccountRequest (or inline)
backend/app/main.py                          # include agency_connect router
backend/.env.example                         # new redirect URI paths
frontend/src/lib/types.ts                    # agency OAuth API methods
frontend/src/lib/apiClient.http.ts
frontend/src/test/fakeApiClient.ts
frontend/src/pages/SettingsPage.tsx          # Ad platform connections section
frontend/src/pages/ClientDetailPage.tsx      # remove Live connect; promote ID paste
backend/tests/test_oauth_route.py            # rewrite → agency-scoped
backend/tests/test_config.py
backend/tests/test_campaign_push.py
backend/tests/test_launch_route.py
backend/tests/test_google_ads_client.py      # assert login_customer_id in SDK config
frontend tests for Settings + ClientDetail + apiClient
```

---

### Task 1: Agency / Client models + Google push signature

**Files:**
- Modify: `backend/app/models/agency.py`
- Modify: `backend/app/models/client.py`
- Modify: `backend/app/services/google_ads_client.py`
- Modify: `backend/tests/test_google_ads_client.py`

**Interfaces:**
- Produces: `Agency.google_ads_refresh_token_encrypted`, `Agency.google_ads_login_customer_id`, `Agency.meta_access_token_encrypted`
- Produces: `GoogleAdsPushPort.push(plan, refresh_token, login_customer_id: str, customer_id: str) -> str` (Fake + Real + DemoAware)

- [ ] **Step 1: Write failing test that RealGoogleAdsPushClient passes `login_customer_id` into load_from_dict**

Patch `GoogleAdsClient.load_from_dict` to capture config; call `push(..., login_customer_id="4574433227", customer_id="123")`; assert config contains `"login_customer_id": "4574433227"`.

- [ ] **Step 2: Update Agency/Client models and all `push` signatures**

```python
# agency.py — add LargeBinary + String columns per spec
# client.py — delete google_refresh_token_encrypted / meta_access_token_encrypted from mapped columns
# google_ads_client.py — signature + load_from_dict login_customer_id
```

- [ ] **Step 3: Run `pytest backend/tests/test_google_ads_client.py -q` — expect pass (other suites may fail until later tasks)**

- [ ] **Step 4: Commit** `feat: move ad tokens to Agency model and require login_customer_id on Google push`

---

### Task 2: Agency connect router + remove client OAuth + ad-account gate

**Files:**
- Create: `backend/app/routers/agency_connect.py`
- Create: `backend/app/schemas/agency_connect.py` (optional; can live next to oauth schema)
- Modify: `backend/app/routers/clients.py`
- Modify: `backend/app/main.py`
- Rewrite: `backend/tests/test_oauth_route.py` → agency routes + updated ad-account gates

**Interfaces:**
- `GET /agency/google/oauth/start` → `{authorize_url}` with `state=str(agency.id)`
- `GET /agency/google/oauth/callback?code&state` → stores agency refresh token, redirects to `{frontend}/settings?connected=google`
- Same for Meta → `?connected=meta`
- `PUT /agency/google/manager-account` body `{login_customer_id}` → sets `agency.google_ads_login_customer_id` (409 if no Google token yet)
- Client `_client_response`: `google_connected = customer_id is not None`
- `set_google_ad_account`: 409 if `agency.google_ads_refresh_token_encrypted is None`
- Demo-connect: set client target ID; set agency demo token (+ `login_customer_id="demo-mcc"` if unset) so push still works

- [ ] **Step 1: Rewrite oauth tests for `/agency/...` paths; update ad-account 409 copy expectations**

- [ ] **Step 2: Implement router + clients.py changes + register in main**

- [ ] **Step 3: `pytest backend/tests/test_oauth_route.py backend/tests/test_clients.py -q`**

- [ ] **Step 4: Commit** `feat: add agency OAuth routes and drop per-client connect`

---

### Task 3: campaign_push, launches, config/status

**Files:**
- Modify: `backend/app/services/campaign_push.py`
- Modify: `backend/app/routers/launches.py`
- Modify: `backend/app/routers/config.py`
- Modify: `backend/tests/test_campaign_push.py`, `test_launch_route.py`, `test_config.py`
- Grep/fix any other tests constructing `Client(..., google_refresh_token_encrypted=...)`

**Interfaces:**
- Push Google when `agency.google_ads_refresh_token_encrypted and agency.google_ads_login_customer_id and client.google_ads_customer_id and draft.google_plan_json`
- Push Meta when `agency.meta_access_token_encrypted and client.meta_ad_account_id and draft.meta_plan_json`
- `google_client.push(plan, refresh_token, agency.google_ads_login_customer_id, client.google_ads_customer_id)`
- `/config/status` per spec (env **and** agency token fields)

- [ ] **Step 1: Update failing tests to put tokens on Agency**

- [ ] **Step 2: Implement push/launch/config**

- [ ] **Step 3: Full backend `pytest -q`**

- [ ] **Step 4: Commit** `feat: read agency credentials in push/launch and config status`

---

### Task 4: Frontend Settings + ClientDetail + apiClient

**Files:**
- Modify: `frontend/src/lib/types.ts`, `apiClient.http.ts`, `fakeApiClient.ts`, tests
- Modify: `frontend/src/pages/SettingsPage.tsx` (+ test if present / add)
- Modify: `frontend/src/pages/ClientDetailPage.tsx` + `.test.tsx`

**Interfaces:**
- Remove `getGoogleOAuthUrl(clientId)` / `getMetaOAuthUrl(clientId)`
- Add `getAgencyGoogleOAuthUrl()`, `getAgencyMetaOAuthUrl()`, `setGoogleManagerAccount(loginCustomerId)`
- Settings: “Ad platform connections” with MCC copy + Connect buttons + login customer ID input
- ClientDetail: remove Live connect buttons; always show Customer ID / Ad Account ID paste as primary link path; keep Demo connect

- [ ] **Step 1: Update apiClient + ClientDetail tests (remove live OAuth expectations)**

- [ ] **Step 2: Implement UI + client methods**

- [ ] **Step 3: `npm test -- --run` and `npx tsc -b`**

- [ ] **Step 4: Commit** `feat: agency Settings connect UI and client link-by-ID`

---

### Task 5: Env example + live `dev.db` ALTER + push main

**Files:**
- Modify: `backend/.env.example` (and local `.env` redirect URIs if present — do not commit secrets)
- Shell: `ALTER TABLE` on `backend/dev.db`

```sql
ALTER TABLE agencies ADD COLUMN google_ads_refresh_token_encrypted BLOB;
ALTER TABLE agencies ADD COLUMN google_ads_login_customer_id VARCHAR(32);
ALTER TABLE agencies ADD COLUMN meta_access_token_encrypted BLOB;
```

(Idempotent: ignore “duplicate column” errors if re-run.)

- [ ] **Step 1: Update `.env.example` redirect paths to `/agency/google/oauth/callback` and `/agency/meta/oauth/callback`**

- [ ] **Step 2: Apply ALTER TABLE to local `dev.db`**

- [ ] **Step 3: Final full backend + frontend suites**

- [ ] **Step 4: Push `main` to origin** (user requested implement + push to main)

---

## Self-Review

1. **Spec coverage:** Agency columns ✓, agency routes ✓, remove client OAuth ✓, ad-account agency gate ✓, connected=linked ✓, Google `login_customer_id` ✓, campaign_push/launches two-part ✓, config/status per-agency ✓, Settings UI ✓, ClientDetail paste-primary ✓, SQLite leave old columns ✓, demo-connect adapted ✓. Out of scope left out ✓.
2. **Placeholder scan:** none intentional.
3. **Type consistency:** `push(plan, refresh_token, login_customer_id, customer_id)` used in client, protocol, fake, campaign_push.
4. **Ops bite list (user callouts):** redirect URI change, one-time reconnect, config/status meaning, manual ALTER — all in Global Constraints + Task 5.
