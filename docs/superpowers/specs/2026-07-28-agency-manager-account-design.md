# Agency-Level Manager Account Connect — Design

## Context & Goal

Today, connecting a client's Google Ads / Meta account means the **client personally logs into a Google/Meta OAuth consent screen inside Performi** (`backend/app/routers/clients.py:139-216` — `google_oauth_start`/`google_oauth_callback`, `meta_oauth_start`/`meta_oauth_callback`, both scoped per-client, storing a per-client encrypted refresh/access token). This doesn't scale past your own agency's test account: no real client is going to OAuth into a SaaS tool they've never heard of, and it's not how any real ad agency operates.

Real agencies use **manager-account access**: Google Ads Manager Accounts (MCC — you already have one, ID `4574433227`) and Meta Business Manager partner access. The agency authenticates **once, ever**, as the owner of their own manager account/Business Manager. From then on, that single credential can act on **every client account the client has linked/granted access to** — no client-side OAuth, ever.

**Decisions already made (do not re-litigate):**
- The agency links clients **manually**, outside Performi (Google Ads UI / Meta Business Manager UI), then pastes the resulting linked Customer ID / Ad Account ID into Performi — same low-lift pattern as the manual ad-account-id entry that already exists today. Performi does **not** call any API to send the link invite itself.
- This **replaces** per-client OAuth entirely. It is not an added option alongside it. Remove the old flow, don't keep it as a fallback.

## Current State (reference)

- `backend/app/models/client.py:18-22` — `Client.google_ads_customer_id`/`google_refresh_token_encrypted`, `Client.meta_ad_account_id`/`meta_access_token_encrypted`. Each client stores its own encrypted OAuth token.
- `backend/app/models/agency.py` — `Agency` has no ad-platform fields at all today.
- `backend/app/routers/clients.py:139-216` — client-scoped OAuth start/callback for both platforms. Callback resolves the client via `state` (no auth header available on the raw browser redirect — see the docstrings there for why).
- `backend/app/routers/clients.py:219-254` — `set_google_ad_account`/`set_meta_ad_account`: manual entry of the target Customer ID / Ad Account ID, currently gated behind "must have connected first" (`409` if `*_token_encrypted is None`).
- `backend/app/routers/clients.py:257-302` — demo-connect: stamps a fake `demo-{client_id[:8]}` ID and a fake encrypted token. **This logic does not need to change** — it's already independent of where a real token comes from.
- `backend/app/services/google_oauth.py` / `app/services/meta_oauth.py` — `build_authorize_url(state)`, `exchange_code_for_tokens(code)`. Pure, reusable, not tied to "client" as a concept anywhere in their own code.
- `backend/app/encryption.py` — `encrypt_token`/`decrypt_token` via Fernet, not tied to Client either.
- `backend/app/services/campaign_push.py:45-65` — fetches `client_row.google_refresh_token_encrypted`/`client_row.meta_access_token_encrypted`, decrypts, calls `google_client.push(plan, refresh_token, client_row.google_ads_customer_id)` / `meta_client.push(plan, access_token, client_row.meta_ad_account_id)`.
- `backend/app/services/google_ads_client.py` — `RealGoogleAdsPushClient.push(plan, refresh_token, customer_id)` builds `GoogleAdsClient.load_from_dict({..., "refresh_token": refresh_token})` with **no `login_customer_id`** — this is the exact piece that makes manager-account-scoped calls impossible today.
- `backend/app/services/meta_ads_client.py` — `RealMetaAdsPushClient.push(plan, access_token, ad_account_id)` — needs no equivalent change; a token from a Business Manager admin already acts on any ad account with granted partner access, no extra header.
- `backend/app/routers/launches.py:44-50` — gates launch-readiness on `client_row.google_refresh_token_encrypted`/`client_row.meta_access_token_encrypted`.
- `backend/app/routers/config.py` — `/config/status` reports `google_ads_configured`/`meta_configured` from **global `.env` settings only** (developer token, app ID/secret) — doesn't reflect per-agency connection state today because there wasn't a per-agency credential to check.
- `backend/app/services/client_deletion.py` — verified: does not reference the token fields directly (deletes the whole `Client` row at the end, whatever columns it has) — no change needed here.

## Target Design

### 1. Agency gets the ad-platform credentials, not Client

```python
# backend/app/models/agency.py — add:
google_ads_refresh_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
google_ads_login_customer_id: Mapped[str | None] = mapped_column(String(32), default=None)  # the MCC's own Customer ID
meta_access_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
```

```python
# backend/app/models/client.py — remove:
google_refresh_token_encrypted: Mapped[bytes | None] = ...  # DELETE
meta_access_token_encrypted: Mapped[bytes | None] = ...     # DELETE
# KEEP google_ads_customer_id / meta_ad_account_id — these now mean "linked account ID",
# set once the agency has manually linked the client under their manager account.
```

### 2. New agency-level OAuth routes (new file: `backend/app/routers/agency_connect.py`)

Same reused `build_authorize_url`/`exchange_code_for_tokens`/`encrypt_token` from `google_oauth.py`/`meta_oauth.py`/`encryption.py` — just re-scoped to `Agency` instead of `Client`, following the exact same headerless-callback pattern already proven in `clients.py`:

```python
GET  /agency/google/oauth/start     — authenticated (get_current_agency), returns {authorize_url}, state=str(agency.id)
GET  /agency/google/oauth/callback  — no auth dependency, resolves agency via `state`, stores refresh token
GET  /agency/meta/oauth/start       — same shape
GET  /agency/meta/oauth/callback    — same shape
PUT  /agency/google/manager-account — {login_customer_id: str} — manual entry of the MCC's own Customer ID (you already know yours: 4574433227)
```

**Callback redirect URIs are new, static paths** (`/agency/google/oauth/callback`, `/agency/meta/oauth/callback`) — these must be registered with Google/Meta as valid redirect URIs (update `GOOGLE_ADS_OAUTH_REDIRECT_URI`/`META_OAUTH_REDIRECT_URI` in `.env` and in the Google Cloud / Meta App dashboards) **before** removing the old client-scoped ones, or the agency connect flow won't work end-to-end.

The agency doing this OAuth **must be logged into the Google account that owns/administers the MCC** — that's an operational fact, not something the code can enforce; put it explicitly in the Settings page copy ("Connect using the Google account that manages your Google Ads Manager Account").

### 3. Remove client-scoped OAuth entirely

Delete `google_oauth_start`, `google_oauth_callback`, `meta_oauth_start`, `meta_oauth_callback` from `clients.py` (lines 139-216). Delete the corresponding frontend "Connect (Live)" buttons and `getGoogleOAuthUrl(clientId)`/`getMetaOAuthUrl(clientId)` from `apiClient`.

### 4. Manual ad-account linking becomes the only path — drop the "must connect first" gate

`set_google_ad_account`/`set_meta_ad_account` (`clients.py:219-254`) currently 409 if the client hasn't OAuth'd yet. That guard no longer makes sense — replace it with checking the **agency** is connected instead:

```python
@router.put("/{client_id}/google/ad-account", response_model=ClientResponse)
def set_google_ad_account(client_id, body, db=Depends(get_db), agency=Depends(get_current_agency)) -> ClientResponse:
    client = _get_owned_client(db, client_id, agency)
    if agency.google_ads_refresh_token_encrypted is None:
        raise HTTPException(status_code=409, detail="Connect your Google Ads Manager Account in Settings first")
    client.google_ads_customer_id = body.customer_id
    ...
```

Same shape for `set_meta_ad_account` against `agency.meta_access_token_encrypted`.

`_client_response`'s `google_connected`/`meta_connected` fields (`clients.py:47-48`) change meaning from "has a token" to **"is linked"**: `google_connected = client.google_ads_customer_id is not None`, `meta_connected = client.meta_ad_account_id is not None`.

### 5. Push clients — the one real technical change

**Google needs a new parameter.** `RealGoogleAdsPushClient.push` must accept both the manager's `login_customer_id` and the target client's `customer_id`, and pass `login_customer_id` into the SDK config — this is the actual mechanism that makes manager-scoped calls work:

```python
def push(self, plan: GoogleCampaignPlan, refresh_token: str, login_customer_id: str, customer_id: str) -> str:
    gclient = GoogleAdsClient.load_from_dict({
        "developer_token": settings.google_ads_developer_token,
        "client_id": settings.google_ads_client_id,
        "client_secret": settings.google_ads_client_secret,
        "refresh_token": refresh_token,
        "login_customer_id": login_customer_id,   # NEW — the MCC's own ID
        "use_proto_plus": True,
    })
    # everything downstream still targets customer_id (the client's account), unchanged
```

`GoogleAdsPushPort` protocol and `FakeGoogleAdsPushClient`/`DemoAwareGoogleAdsPushClient` need their `push(...)` signatures updated to match (the demo-aware wrapper still just forwards to Fake or Real based on the `customer_id.startswith("demo-")` check — that logic is untouched).

**Meta needs no signature change** — `RealMetaAdsPushClient.push(plan, access_token, ad_account_id)` stays exactly as-is; only *where* `access_token` comes from changes (agency-level, not client-level).

### 6. `campaign_push.py` — read credentials from Agency, target IDs from Client

```python
def push_draft_with_clients(db, draft_id, google_client, meta_client, sleep_fn=time.sleep):
    draft = db.get(CampaignDraft, draft_id)
    client_row = draft.brief.client
    agency = client_row.agency   # or pass agency in explicitly — either works, pick whichever fits call sites cleanest
    ...
    if agency.google_ads_refresh_token_encrypted and client_row.google_ads_customer_id and draft.google_plan_json:
        refresh_token = decrypt_token(agency.google_ads_refresh_token_encrypted)
        external_id, error = _push_with_retry(
            lambda: google_client.push(plan, refresh_token, agency.google_ads_login_customer_id, client_row.google_ads_customer_id),
            sleep_fn,
        )
    if agency.meta_access_token_encrypted and client_row.meta_ad_account_id and draft.meta_plan_json:
        access_token = decrypt_token(agency.meta_access_token_encrypted)
        external_id, error = _push_with_retry(
            lambda: meta_client.push(plan, access_token, client_row.meta_ad_account_id), sleep_fn
        )
```

Note the gate is now a **two-part condition**: agency must be connected *and* this specific client must be linked. Both matter — don't collapse them into one check, since "agency connected but this one client not yet linked" is a completely normal, expected state (most clients, most of the time, before the agency links each one).

`launches.py:44-50`'s `google_ready`/`meta_ready` pre-flight check needs the same two-part update, checking `agency.*` instead of `client_row.*` for the token half.

### 7. `/config/status` becomes genuinely per-agency

```python
@router.get("/status")
def config_status(agency: Agency = Depends(get_current_agency), db: Session = Depends(get_db)) -> dict[str, bool]:
    settings = get_settings()
    return {
        "anthropic_configured": bool(settings.anthropic_api_key),
        "google_ads_configured": bool(
            settings.google_ads_client_id and settings.google_ads_client_secret
            and settings.google_ads_developer_token
            and agency.google_ads_refresh_token_encrypted and agency.google_ads_login_customer_id
        ),
        "meta_configured": bool(
            settings.meta_app_id and settings.meta_app_secret and agency.meta_access_token_encrypted
        ),
    }
```

This is a real behavior change worth calling out explicitly: today `google_ads_configured`/`meta_configured` reflect whether the **app** has credentials at all (a global, effectively single-tenant question). After this change they reflect whether **this agency** has connected — which is the correct multi-tenant question, but means the demo-mode banner (`AppShell.tsx`) will now show for every agency until *they themselves* connect, even though the underlying `.env` has real app-level credentials. That's intentional and correct, not a regression — flag it if it surprises whoever tests this.

## Frontend Impact

- `frontend/src/pages/SettingsPage.tsx` — new "Ad platform connections" section: "Connect Google Ads Manager Account" / "Connect Meta Business Manager" buttons (agency-level, one-time — same authorize-URL-then-`window.location.assign` pattern already used for the client-level connect being removed), plus an input for `login_customer_id` with the copy explaining it's your MCC's own Customer ID.
- `frontend/src/pages/ClientDetailPage.tsx` — remove the "Connect (Live)" Google/Meta buttons entirely. Keep "Connect (Demo)" if you still want a no-credentials-needed pilot path. Promote the manual Customer ID / Ad Account ID fields to the primary (only) way a client gets linked — remove whatever UI currently disables them until "connected."
- `frontend/src/lib/apiClient.http.ts`/`types.ts` — remove `getGoogleOAuthUrl(clientId)`/`getMetaOAuthUrl(clientId)`; add `getAgencyGoogleOAuthUrl()`/`getAgencyMetaOAuthUrl()`/`setGoogleManagerAccount(loginCustomerId)` (no client ID involved in any of them).

## Migration Notes

- **New Agency columns, existing Client columns removed.** This repo has no migration tool — any `dev.db` predating this change needs the new `agencies` columns added manually (`ALTER TABLE agencies ADD COLUMN ...`), same pattern as every other schema change in this codebase's history. **Recommend leaving the old, now-unused `clients.google_refresh_token_encrypted`/`meta_access_token_encrypted` columns in place in SQLite** rather than dropping them — just remove them from the SQLAlchemy model. Unused columns are harmless; `DROP COLUMN` on a live SQLite file is unnecessary risk for zero benefit here.
- **Your own already-connected test client loses its per-client token** the moment the `Client` model stops reading those columns. This is expected, not a bug: do the new one-time agency-level OAuth connect in Settings, then re-confirm (or re-enter, it should already be correct) the same Customer ID / Ad Account ID on that test client. One-time friction, not a regression.

## Recommended Enhancement (do after the core replumbing works, not required for v1)

**Verify-on-save.** When the agency pastes in a Customer ID / Ad Account ID, they might be entering it before the client has actually accepted the link invite yet. Add a lightweight, non-blocking check at save time: attempt a cheap real API call using the agency's own manager credentials (e.g. Google's `CustomerService.GetCustomer` for the target `customer_id` with `login_customer_id` set, or Meta's `GET /act_<id>?fields=id` with the agency's token) — if it fails with a permission/not-found error, surface a warning ("This account doesn't appear to be linked to your manager account yet — the invite may still be pending") without blocking the save, since the agency may legitimately be entering it ahead of the client's approval. This turns a silent later launch-time failure into an immediate, actionable signal.

## Testing

Per this repo's TDD convention: red-green per change, full suites before considering done. The existing OAuth route tests (`test_oauth_route.py`) are client-scoped and test the pattern this spec removes — either delete/replace them with agency-scoped equivalents, or adapt them in place; don't leave them testing a route that no longer exists. `test_clients.py`, `test_launch_route.py`, `test_campaign_push.py`, `test_google_ads_client.py`, `test_meta_ads_client.py` all construct `Client` rows with the token fields being removed and/or call `push()` with the old signature — all need updating as part of this change, not left broken.

## Explicitly Out of Scope

- Sending the manager-link invite via API (Google `CustomerManagerLinkService` / Meta partner-access API) — explicitly deferred per the "agency links manually" decision.
- Meta System User tokens — a normal Business-Manager-admin OAuth login is sufficient for v1; System Users are a future hardening step (token survives an individual leaving the company) not required now.
- Auto-discovering the MCC's `login_customer_id` via `ListAccessibleCustomers` — manual entry only, per the decisions above.
- Any change to the client portal / Supabase client login (`Client.supabase_user_id`, `get_current_client`) — completely unrelated system, not touched by this spec.
