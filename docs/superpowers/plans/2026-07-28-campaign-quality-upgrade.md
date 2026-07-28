# Campaign Generation Quality Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure campaign generation around 1–3 audience segments (each with keywords, targeting, and multiple ad creatives), then layer on Google extensions, keyword match types, and Meta structured targeting — without inventing Performance Max or a Meta interest-browsing UI.

**Architecture:** `CampaignIR` becomes segment-centric (`AudienceSegment` + `KeywordEntry`). Adapters emit one Google ad group / Meta ad set per segment. Sitelinks stay client-level on `BrandVoiceProfile` (agency-entered), wired into `GoogleCampaignPlan` after `adapt_to_google` at **both** call sites (`generation.py` and `approvals.py`). Push clients gain Asset-based Google extensions, per-keyword match types, Meta interest name→ID resolution, and multi-ad loops. Build in four independently shippable phases.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Anthropic SDK, `google-ads>=25.0.0`, `facebook-business>=21.0.0`, React 19 + TypeScript + Vitest (existing frontend).

**Spec:** `docs/superpowers/specs/2026-07-28-campaign-quality-upgrade-design.md`

## Global Constraints

- Do **not** attempt this as one commit — each phase below is independently shippable and must leave `pytest`, `vitest`, and `tsc -b` green before its phase commit.
- Out of scope: Meta interest browsing/autocomplete UI; Google Performance Max / Display / Video; per-segment CTA; any `projections.py` formula change.
- Sitelinks are **never** LLM-generated and are **not** guardrail-checked.
- Demo generator emits **exactly one** `AudienceSegment` (documented fidelity gap vs live LLM).
- Meta interest free-text must be resolved via Targeting Search before push — never pass raw names into `flexible_spec`.
- Verify Google Ads Asset proto field names against the installed `google-ads` SDK before implementing Phase 2 Asset creation (do not copy unverified field names from the spec).
- Known bug fixed structurally in Phase 1 (adapter keeps all creatives); **full end-to-end Meta multi-ad push** lands in Phase 4. Phase 1 Meta push must read `ad_set.creatives[0]` so the schema change does not break launches mid-upgrade.
- Extra test files beyond the spec’s list of 9 also construct flat `CampaignIR` / mock LLM JSON and **must** be updated in Phase 1: `test_demo_generation.py`, `test_llm_generation.py`, `test_generation_route.py`, `test_briefs.py` (projected-metrics fixture JSON).

---

## File Structure (touched across phases)

```
backend/app/schemas/campaign_ir.py          # AudienceSegment, KeywordEntry, restructured CampaignIR
backend/app/schemas/google_plan.py          # GoogleKeyword, Sitelink, extensions fields
backend/app/schemas/meta_plan.py            # MetaCreative, restructured MetaAdSet
backend/app/schemas/brand_voice.py          # sitelinks (Phase 2)
backend/app/models/brand_voice.py           # sitelinks JSON column (Phase 2)
backend/app/services/{demo,llm}_generation.py
backend/app/services/guardrails.py
backend/app/services/{google,meta}_adapter.py
backend/app/services/{google,meta}_ads_client.py
backend/app/routers/generation.py           # sitelinks wiring after adapt_to_google (Phase 2)
backend/app/routers/approvals.py            # same (Phase 2)
frontend/src/lib/types.ts
frontend/src/lib/apiClient.http.ts
frontend/src/components/CampaignPlanViews.tsx
frontend/src/pages/ClientDetailPage.tsx     # sitelinks editor (Phase 2)
backend/tests/*                             # all CampaignIR constructors + adapter/push tests
```

**Shared test helper (create in Phase 1 Task 1):** `backend/tests/ir_fixtures.py` with `make_campaign_ir(**overrides) -> CampaignIR` so every test file stops hand-rolling the nested shape.

---

# Phase 1 — Audience segments + multi-creative structure

### Task 1: Restructure `CampaignIR` + plan schemas + shared fixture

**Files:**
- Modify: `backend/app/schemas/campaign_ir.py`
- Modify: `backend/app/schemas/google_plan.py`
- Modify: `backend/app/schemas/meta_plan.py`
- Create: `backend/tests/ir_fixtures.py`
- Modify: `backend/tests/test_google_adapter.py`, `backend/tests/test_meta_adapter.py` (first consumers)

**Interfaces:**
- Produces: `KeywordEntry`, `AudienceSegment`, restructured `CampaignIR`; `GoogleKeyword`, updated `GoogleAdGroup`/`GoogleCampaignPlan` (callouts/snippets/sitelinks default empty — unused until Phase 2); `MetaCreative`, restructured `MetaAdSet`/`MetaCampaignPlan`; `make_campaign_ir(**overrides) -> CampaignIR`.

- [ ] **Step 1: Write failing adapter tests for the new shape**

Replace both adapter test files’ constructors with the nested shape and assert new fields. Example for Google:

```python
# backend/tests/test_google_adapter.py
from app.schemas.campaign_ir import AdCopyVariant, AudienceSegment, CampaignIR, KeywordEntry
from app.services.google_adapter import adapt_to_google

def test_adapt_to_google_emits_one_ad_group_per_segment():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Locals",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me"), KeywordEntry(text="austin pastries")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            ),
            AudienceSegment(
                name="Tourists",
                description="Visitors looking for dessert",
                keywords=[KeywordEntry(text="best bakery austin")],
                ad_copy=[AdCopyVariant(headline="Try Austin's Best Bakery", description="Walk-ins welcome.")],
            ),
        ],
        call_to_action="Visit Us Today",
    )
    plan = adapt_to_google(ir)
    assert len(plan.ad_groups) == 2
    assert plan.ad_groups[0].name == "Austin Bakery Foot Traffic - Locals"
    assert [k.text for k in plan.ad_groups[0].keywords] == ["bakery near me", "austin pastries"]
    assert all(k.match_type == "phrase" for k in plan.ad_groups[0].keywords)
```

Meta test must assert `plan.ad_sets[0].creatives` is a **list** with **all** variants (not `creative_headline`):

```python
def test_adapt_to_meta_keeps_all_ad_copy_variants():
    ir = CampaignIR(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me")],
                ad_copy=[
                    AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today."),
                    AdCopyVariant(headline="Sourdough Fresh Daily", description="Open until 6."),
                ],
            )
        ],
        call_to_action="Visit Us Today",
    )
    plan = adapt_to_meta(ir)
    assert len(plan.ad_sets[0].creatives) == 2
    assert plan.ad_sets[0].creatives[1].headline == "Sourdough Fresh Daily"
```

- [ ] **Step 2: Run tests — expect FAIL** (schema / adapter still flat)

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_google_adapter.py tests/test_meta_adapter.py -v`

- [ ] **Step 3: Implement schemas**

Replace `backend/app/schemas/campaign_ir.py` with the target from the spec (Section 1): `KeywordEntry`, `AudienceSegment`, `CampaignIR` with `audience_segments`, `callouts`, `structured_snippets`; remove top-level `audience_description`, `keywords`, `ad_copy`.

Update `google_plan.py` and `meta_plan.py` to the target from the spec (Sections 2–3). Include `callouts`/`structured_snippets`/`sitelinks` on `GoogleCampaignPlan` now (default empty) so Phase 2 only fills them.

- [ ] **Step 4: Add `backend/tests/ir_fixtures.py`**

```python
from app.schemas.campaign_ir import AdCopyVariant, AudienceSegment, CampaignIR, KeywordEntry

def make_campaign_ir(**overrides) -> CampaignIR:
    base = dict(
        campaign_name="Austin Bakery Foot Traffic",
        objective="traffic",
        daily_budget_usd=16.5,
        audience_segments=[
            AudienceSegment(
                name="Primary",
                description="Adults 25-54 near Austin",
                keywords=[KeywordEntry(text="bakery near me"), KeywordEntry(text="austin pastries")],
                ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
            )
        ],
        call_to_action="Visit Us Today",
    )
    base.update(overrides)
    return CampaignIR(**base)
```

- [ ] **Step 5: Commit schemas + fixture + failing adapter tests** (adapters still broken — only commit if you prefer red-green within Task 2; otherwise fold Step 5 into Task 2 commit)

---

### Task 2: Adapters — one ad group / ad set per segment; keep all Meta creatives

**Files:**
- Modify: `backend/app/services/google_adapter.py`
- Modify: `backend/app/services/meta_adapter.py`
- Test: `backend/tests/test_google_adapter.py`, `backend/tests/test_meta_adapter.py`

**Interfaces:**
- Consumes: restructured `CampaignIR`
- Produces: `adapt_to_google(ir) -> GoogleCampaignPlan` with N ad groups; `adapt_to_meta(ir) -> MetaCampaignPlan` with N ad sets and `creatives` from **all** segment ad_copy (fixes `ad_copy[0]` truncation)

- [ ] **Step 1: Implement `adapt_to_google`**

```python
from app.schemas.campaign_ir import CampaignIR
from app.schemas.google_plan import GoogleAdGroup, GoogleCampaignPlan, GoogleKeyword

def adapt_to_google(ir: CampaignIR) -> GoogleCampaignPlan:
    ad_groups = []
    for segment in ir.audience_segments:
        ad_groups.append(
            GoogleAdGroup(
                name=f"{ir.campaign_name} - {segment.name}",
                keywords=[GoogleKeyword(text=kw.text, match_type=kw.match_type) for kw in segment.keywords],
                headlines=[v.headline for v in segment.ad_copy],
                descriptions=[v.description for v in segment.ad_copy],
            )
        )
    return GoogleCampaignPlan(
        campaign_name=ir.campaign_name,
        daily_budget_micros=round(ir.daily_budget_usd * 1_000_000),
        end_date=ir.end_date,
        final_url=ir.website_url,
        negative_keywords=list(ir.negative_keywords),
        ad_groups=ad_groups,
        callouts=list(ir.callouts),
        structured_snippets=dict(ir.structured_snippets),
        # sitelinks left empty — populated by generation/approvals routers in Phase 2
    )
```

- [ ] **Step 2: Implement `adapt_to_meta`** (no more `[0]` truncation)

```python
from app.schemas.campaign_ir import CampaignIR
from app.schemas.meta_plan import MetaAdSet, MetaCampaignPlan, MetaCreative

def adapt_to_meta(ir: CampaignIR) -> MetaCampaignPlan:
    per_set_budget = round(ir.daily_budget_usd * 100 / max(len(ir.audience_segments), 1))
    ad_sets = []
    for segment in ir.audience_segments:
        ad_sets.append(
            MetaAdSet(
                name=f"{ir.campaign_name} - {segment.name}",
                daily_budget_cents=per_set_budget,
                targeting_description=segment.description,
                age_min=segment.age_min,
                age_max=segment.age_max,
                interests=list(segment.interests),
                creatives=[
                    MetaCreative(headline=v.headline, body=v.description, call_to_action=ir.call_to_action)
                    for v in segment.ad_copy
                ],
            )
        )
    return MetaCampaignPlan(
        campaign_name=ir.campaign_name,
        objective=ir.objective,
        website_url=ir.website_url,
        ad_sets=ad_sets,
    )
```

- [ ] **Step 3: Run adapter tests — expect PASS**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_google_adapter.py tests/test_meta_adapter.py -v`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/campaign_ir.py backend/app/schemas/google_plan.py backend/app/schemas/meta_plan.py \
  backend/app/services/google_adapter.py backend/app/services/meta_adapter.py \
  backend/tests/ir_fixtures.py backend/tests/test_google_adapter.py backend/tests/test_meta_adapter.py
git commit -m "feat: segment-centric CampaignIR and multi-creative Meta adapter"
```

---

### Task 3: Guardrails + generators (demo + LLM)

**Files:**
- Modify: `backend/app/services/guardrails.py`
- Modify: `backend/app/services/demo_generation.py`
- Modify: `backend/app/services/llm_generation.py`
- Modify: `backend/tests/test_guardrails.py`, `backend/tests/test_demo_generation.py`, `backend/tests/test_llm_generation.py`

**Interfaces:**
- Consumes: segmented `CampaignIR`
- Produces: rule checks over flattened segment copy/keywords; demo IR with exactly one segment; LLM prompt requesting segments + callouts + structured_snippets

- [ ] **Step 1: Update guardrail tests to use `make_campaign_ir` / nested shape; add one multi-segment banned-term case**

- [ ] **Step 2: Update `run_rule_checks`**

```python
all_ad_copy = [copy for segment in ir.audience_segments for copy in segment.ad_copy]
all_keywords = [kw.text for segment in ir.audience_segments for kw in segment.keywords]

haystack = " ".join(
    [ir.campaign_name, *[c.headline + " " + c.description for c in all_ad_copy]]
).lower()
# ... banned term loop unchanged ...

overlap = sorted({keyword for keyword in all_keywords if keyword.lower() in negative_keywords})
```

Optional warn if any segment has `not segment.ad_copy`.

- [ ] **Step 3: Restructure `generate_demo_campaign_ir`** to wrap today’s single-audience logic in one `AudienceSegment(name="Primary", ...)`, keywords as `KeywordEntry(text=..., match_type="phrase")`, leave `callouts=[]` / `structured_snippets={}`.

- [ ] **Step 4: Update `_build_prompt` / `_SYSTEM_PROMPT` in `llm_generation.py`** to request:

```
audience_segments (1-3 objects: name, description, age_min, age_max, interests, keywords[{text,match_type}], ad_copy[{headline,description}]),
call_to_action, callouts (3-10 short phrases), structured_snippets (object header->string list),
```

Keep force-overrides for `end_date`, `website_url`, `negative_keywords`. Bump `max_tokens` if needed (e.g. 2048) for larger JSON.

- [ ] **Step 5: Update LLM test mock JSON payloads** in `test_llm_generation.py` to the new shape; update `test_demo_generation.py` assertions (`ir.audience_segments[0].description` instead of `ir.audience_description`).

- [ ] **Step 6: Run**

Run: `cd backend && .venv\Scripts\python.exe -m pytest tests/test_guardrails.py tests/test_demo_generation.py tests/test_llm_generation.py -v`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: segment-aware guardrails and generators"
```

---

### Task 4: Push clients — structural loop (still hardcoded match type / targeting)

**Files:**
- Modify: `backend/app/services/google_ads_client.py` — keyword loop uses `keyword.text` (still `PHRASE`)
- Modify: `backend/app/services/meta_ads_client.py` — creative fields from `ad_set.creatives[0]` (still one ad; still broad US 18-65)
- Modify: `backend/tests/test_google_ads_client.py`, `backend/tests/test_meta_ads_client.py` as needed for new plan shapes

**Interfaces:**
- Consumes: new `GoogleCampaignPlan` / `MetaCampaignPlan`
- Produces: successful push with multiple ad groups / ad sets; Meta still one ad per set until Phase 4

- [ ] **Step 1: Google keyword loop**

```python
for keyword in group.keywords:
    criterion_op.create.keyword.text = keyword.text
    criterion_op.create.keyword.match_type = gclient.enums.KeywordMatchTypeEnum.PHRASE
```

- [ ] **Step 2: Meta creative from first creative only (temporary)**

```python
primary = ad_set.creatives[0]
# use primary.headline / primary.body in object_story_spec
# TODO Phase 4: loop all creatives
```

- [ ] **Step 3: Run push client tests + commit**

```bash
git commit -m "fix: push clients consume segmented Google/Meta plans"
```

---

### Task 5: Frontend types + plan views

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/apiClient.http.ts` (+ tests)
- Modify: `frontend/src/components/CampaignPlanViews.tsx`
- Modify any page tests that assert old Meta `creativeHeadline` fields

**Interfaces:**
- Produces: TS mirrors of backend plans; UI renders per-segment groups/sets, keyword match-type badges, multiple Meta creatives

- [ ] **Step 1: Update types**

```typescript
export interface GoogleKeyword {
  text: string
  matchType: 'exact' | 'phrase' | 'broad'
}
export interface GoogleAdGroupPlan {
  name: string
  keywords: GoogleKeyword[]
  headlines: string[]
  descriptions: string[]
}
export interface Sitelink {
  text: string
  url: string
  description: string | null
}
export interface GoogleCampaignPlan {
  campaignName: string
  dailyBudgetMicros: number
  endDate: string | null
  finalUrl: string | null
  negativeKeywords: string[]
  adGroups: GoogleAdGroupPlan[]
  callouts: string[]
  structuredSnippets: Record<string, string[]>
  sitelinks: Sitelink[]
}

export interface MetaCreative {
  headline: string
  body: string
  callToAction: string
}
export interface MetaAdSetPlan {
  name: string
  dailyBudgetCents: number
  targetingDescription: string
  ageMin: number | null
  ageMax: number | null
  interests: string[]
  creatives: MetaCreative[]
}
```

- [ ] **Step 2: Update `Raw*` interfaces and `toGooglePlan` / `toMetaPlan` mappers** (snake_case → camelCase, including nested keywords/creatives). Default missing `callouts`/`sitelinks`/`structured_snippets` to `[]`/`{}` for resilience.

- [ ] **Step 3: Update `GooglePlanView` / `MetaPlanView`**
  - Keyword badges: show `keyword.text` + small match-type label
  - Meta: map `adSet.creatives` (headline/body/CTA each)
  - Optionally render callouts/snippets/sitelinks sections when non-empty (Phase 2 will populate them)

- [ ] **Step 4: Run**

Run: `cd frontend && npm test -- --run && npx tsc -b`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: frontend renders segmented Google/Meta campaign plans"
```

---

### Task 6: Migrate all remaining `CampaignIR` / mock-JSON constructors + Phase 1 green

**Files (must all compile against new IR):**
- `backend/tests/test_guardrails_route.py`
- `backend/tests/test_launch_route.py`
- `backend/tests/test_client_portal.py`
- `backend/tests/test_projections.py`
- `backend/tests/test_campaign_push.py`
- `backend/tests/test_approvals.py`
- `backend/tests/test_generation_route.py`
- `backend/tests/test_briefs.py` (any `ir_json` / projected fixtures with flat keys)

Prefer `from tests.ir_fixtures import make_campaign_ir` (or relative import matching this repo’s pytest layout).

- [ ] **Step 1: Grep for leftovers and fix**

Run: `cd backend && rg "audience_description|keywords=\[" --glob "tests/**/*.py"`
Also: `rg "creative_headline|\"keywords\":" tests frontend`

- [ ] **Step 2: Full suites**

```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd ../frontend && npm test -- --run && npx tsc -b
```

- [ ] **Step 3: Phase 1 commit (if any stragglers)**

```bash
git commit -m "test: migrate all CampaignIR fixtures to audience_segments"
```

**Phase 1 done when:** adapters keep all Meta creatives in the plan; Google emits N ad groups; generators/guardrails/frontend green; push still uses PHRASE + broad targeting + Meta `creatives[0]`.

---

# Phase 2 — Google extensions (callouts, structured snippets, sitelinks)

### Task 7: Brand-voice sitelinks model + API + ClientDetail UI

**Files:**
- Modify: `backend/app/models/brand_voice.py` — `sitelinks: Mapped[list] = mapped_column(JSON, default=list)`
- Modify: `backend/app/schemas/brand_voice.py` — `SitelinkInput` + fields on request/response
- Modify: brand-voice router/handlers that map request → model (find via `BrandVoiceProfileRequest`)
- Modify: `frontend/src/lib/types.ts`, `apiClient.http.ts`
- Modify: `frontend/src/pages/ClientDetailPage.tsx` (+ tests) — repeatable sitelink rows (text/url/description), same pattern as other brand-voice list fields
- Tests: extend existing brand-voice / client detail tests

- [ ] **Step 1: Failing API/UI tests for round-trip sitelinks**
- [ ] **Step 2: Model + schema + frontend editor**
- [ ] **Step 3: Commit** `feat: client-level sitelinks on brand voice`

### Task 8: Wire sitelinks + IR extensions into Google plan at both adapter call sites

**Files:**
- Modify: `backend/app/routers/generation.py` (~line 44)
- Modify: `backend/app/routers/approvals.py` (~line 39)
- Tests: `test_generation_route.py`, `test_approvals.py` — assert `google_plan.sitelinks` populated from brand voice; callouts/snippets from IR

**Helper (add near adapters or inline):**

```python
from app.schemas.google_plan import Sitelink

def attach_sitelinks(plan: GoogleCampaignPlan, brand_voice) -> GoogleCampaignPlan:
    if brand_voice is None:
        return plan
    plan.sitelinks = [Sitelink(**s) for s in (brand_voice.sitelinks or [])]
    return plan
```

In `generation.py` after `adapt_to_google(ir)`:

```python
google_plan = adapt_to_google(ir) if "google" in platforms else None
if google_plan is not None:
    google_plan = attach_sitelinks(google_plan, brand_voice)
```

In `approvals.py` when re-adapting `edited_ir`, load `draft.brief.client.brand_voice_profile` and call the same helper (client is already reachable via `draft.brief.client`).

- [ ] **Step 1: Failing tests for both routes**
- [ ] **Step 2: Implement helper + both call sites**
- [ ] **Step 3: Commit** `feat: attach client sitelinks on Google plan adaptation`

### Task 9: Google Ads Asset creation for extensions

**Files:**
- Modify: `backend/app/services/google_ads_client.py`
- Modify: `backend/tests/test_google_ads_client.py` (monkeypatch pattern already in file)

**Implementation notes:**
1. After campaign create, if `plan.callouts` / `structured_snippets` / `sitelinks` non-empty, use `AssetService.mutate_assets` then `CampaignAssetService.mutate_campaign_assets` with `field_type` `CALLOUT` | `STRUCTURED_SNIPPET` | `SITELINK`.
2. **Verify field names** against installed SDK (`CalloutAsset`, `StructuredSnippetAsset`, `SitelinkAsset`) before coding.
3. Soft-skip empty lists; do not fail the whole push if one extension type errors — match existing soft-fail style if present, otherwise fail clearly in tests first.

- [ ] **Step 1: Failing test asserting asset + campaign_asset mutate calls when plan has callouts/sitelinks**
- [ ] **Step 2: Implement after verifying SDK protos**
- [ ] **Step 3: Frontend already shows extensions when present — smoke-check `CampaignPlanViews`**
- [ ] **Step 4: Full suites + commit** `feat: push Google callouts, snippets, and sitelinks as assets`

---

# Phase 3 — Google keyword match types

### Task 10: Per-keyword match type in `RealGoogleAdsPushClient`

**Files:**
- Modify: `backend/app/services/google_ads_client.py`
- Modify: `backend/tests/test_google_ads_client.py`

```python
_MATCH = {
    "exact": gclient.enums.KeywordMatchTypeEnum.EXACT,
    "phrase": gclient.enums.KeywordMatchTypeEnum.PHRASE,
    "broad": gclient.enums.KeywordMatchTypeEnum.BROAD,
}
criterion_op.create.keyword.match_type = _MATCH[keyword.match_type]
```

- [ ] **Step 1: Test that an exact-match keyword sets EXACT enum**
- [ ] **Step 2: Implement lookup (default phrase if unknown)**
- [ ] **Step 3: Commit** `feat: honor Google keyword match types on push`

---

# Phase 4 — Meta structured targeting + multi-ad push

### Task 11: Interest name→ID resolution helper

**Files:**
- Create: `backend/app/services/meta_interest_resolver.py` (or private helpers on the push client)
- Test: `backend/tests/test_meta_interest_resolver.py` with httpx/monkeypatch — no network

```python
def resolve_interest(keyword: str, access_token: str, http_client) -> dict | None:
    # GET graph search?type=adinterest&q=...&limit=1
    # return {"id": ..., "name": ...} or None
```

Skip unmatched interests; collect skipped names for logging / soft surface if the push result shape allows.

- [ ] **Step 1: Failing unit tests (match / no-match)**
- [ ] **Step 2: Implement**
- [ ] **Step 3: Commit** `feat: resolve Meta interest keywords via Targeting Search`

### Task 12: Meta ad set targeting + multi-creative ads

**Files:**
- Modify: `backend/app/services/meta_ads_client.py`
- Modify: `backend/tests/test_meta_ads_client.py`

Targeting:

```python
age_min = ad_set.age_min if ad_set.age_min is not None else 18
age_max = ad_set.age_max if ad_set.age_max is not None else 65
resolved = [r for r in (resolve_interest(i, access_token, http) for i in ad_set.interests) if r]
targeting = {
    "geo_locations": {"countries": ["US"]},
    "age_min": age_min,
    "age_max": age_max,
}
if resolved:
    targeting["flexible_spec"] = [{"interests": [{"id": r["id"], "name": r["name"]} for r in resolved]}]
```

Multi-ad:

```python
for index, creative in enumerate(ad_set.creatives):
    # create_ad_creative + create_ad named f"{ad_set.name} Ad {index+1}"
```

- [ ] **Step 1: Tests for age defaults, interest flexible_spec, N creatives → N ads**
- [ ] **Step 2: Implement**
- [ ] **Step 3: Full suites**

```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd ../frontend && npm test -- --run && npx tsc -b
```

- [ ] **Step 4: Commit** `feat: Meta structured targeting and multi-ad creatives on push`

---

## Spec coverage checklist (self-review)

| Spec requirement | Task(s) |
|---|---|
| `AudienceSegment` / `KeywordEntry` / restructured IR | 1 |
| Google/Meta plan schema updates | 1 |
| Meta adapter keeps all creatives (bug) | 2 |
| Google adapter one ad group per segment | 2 |
| Guardrails flatten segments | 3 |
| LLM + demo generators | 3 |
| Push structural compatibility | 4 |
| Frontend types + plan views | 5 |
| All CampaignIR test constructors (9 + extras) | 6 |
| Sitelinks on brand voice + UI | 7 |
| Sitelinks at **both** `generation.py` and `approvals.py` | 8 |
| Google Asset extensions | 9 |
| Keyword match types on push | 10 |
| Meta interest resolution | 11 |
| Meta age + multi-ad push | 12 |
| Out of scope (PMax, interest UI, projections) | explicitly skipped |

## Placeholder / consistency notes

- Budget split across Meta ad sets uses equal split of campaign daily budget — document in adapter comment; adjust later if product wants campaign-level budget only.
- Phase 1 Meta push uses `creatives[0]` intentionally; Phase 4 removes that limitation.
- Do not leave `creative_headline` / top-level `keywords: list[str]` aliases — breaking change is intentional.
