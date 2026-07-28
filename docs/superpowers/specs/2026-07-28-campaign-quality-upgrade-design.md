# Campaign Generation Quality Upgrade — Design

## Context & Goal

Today, one brief produces one generic campaign: a single audience description, one flat keyword list, and — critically — Meta only ever uses the *first* ad-copy variant even when the LLM writes more than one (`app/services/meta_adapter.py:6`, `primary_copy = ir.ad_copy[0]`). There are no Google ad extensions (sitelinks/callouts/structured snippets), no keyword match-type strategy (hardcoded phrase match), and no structured Meta audience targeting (hardcoded broad `US, 18-65` in `app/services/meta_ads_client.py:86-90`).

This spec closes that gap: campaigns generate 1-3 audience-segment variants (each with its own keywords, targeting, and multiple ad creatives), Google campaigns get real extensions, and Meta campaigns get real structured targeting. This is the actual shape of what Google and Meta themselves document as best practice for a well-built campaign — not new product ideas, just catching this app up to table stakes.

**This is a large, cross-cutting change.** It touches the core `CampaignIR` schema and cascades through both generators, both guardrail checks, both adapters, both real push clients, and the frontend plan-rendering components. Build in the phased order at the end of this doc — do not attempt it as one commit.

## Current State (reference)

- `backend/app/schemas/campaign_ir.py` — `CampaignIR`: one `audience_description: str`, one flat `keywords: list[str]`, `ad_copy: list[AdCopyVariant]` (headline/description pairs), one `call_to_action: str`.
- `backend/app/schemas/google_plan.py` — `GoogleCampaignPlan.ad_groups: list[GoogleAdGroup]`, currently always exactly one ad group (`app/services/google_adapter.py:6`), `keywords: list[str]` (no match type).
- `backend/app/schemas/meta_plan.py` — `MetaCampaignPlan.ad_sets: list[MetaAdSet]`, currently always exactly one ad set, one creative (`creative_headline`/`creative_body`) — `ad_copy[1:]` is silently discarded.
- `backend/app/services/llm_generation.py` — builds the Claude prompt, asks for the current flat schema.
- `backend/app/services/demo_generation.py` — deterministic non-LLM generator, same flat shape, used when `ANTHROPIC_API_KEY` isn't configured (see the backend demo-mode pattern used throughout this app).
- `backend/app/services/guardrails.py` — `run_rule_checks` iterates `ir.ad_copy` and `ir.keywords` directly (both top-level, not nested).
- `backend/app/services/google_adapter.py` / `meta_adapter.py` — map `CampaignIR` → one `GoogleCampaignPlan` / `MetaCampaignPlan`, one ad group / ad set each.
- `backend/app/services/google_ads_client.py` — `RealGoogleAdsPushClient` creates the budget, campaign, one `AdGroupCriterion` per keyword (hardcoded `KeywordMatchTypeEnum.PHRASE`), one `AdGroupAd` with a `ResponsiveSearchAd`.
- `backend/app/services/meta_ads_client.py` — `RealMetaAdsPushClient` creates the campaign, then per ad set: one `AdSet` (hardcoded broad targeting), one `AdCreative`, one `Ad`.
- `backend/app/services/projections.py` — only reads `ir.daily_budget_usd`, unaffected by this change.
- `backend/app/schemas/brand_voice.py` / `app/models/brand_voice.py` — client-level settings (`tone`, `banned_terms`, `required_disclaimers`, `approved_offers`), one row per client.
- SDKs: `google-ads>=25.0.0`, `facebook-business>=21.0.0` (per `backend/requirements.txt`) — verify exact proto/field names against whatever version is actually installed when implementing Section 7; API surfaces shift between major versions.

## Target Design

### 1. `CampaignIR` — audience segments replace the flat structure

```python
# backend/app/schemas/campaign_ir.py
from datetime import date
from typing import Literal
from pydantic import BaseModel

class AdCopyVariant(BaseModel):
    headline: str
    description: str

class KeywordEntry(BaseModel):
    text: str
    match_type: Literal["exact", "phrase", "broad"] = "phrase"

class AudienceSegment(BaseModel):
    name: str                          # e.g. "Homeowners 35-55"
    description: str                   # targeting prose — feeds Meta's targeting_description
    age_min: int | None = None         # Meta targeting; Google has no direct equivalent, ignored there
    age_max: int | None = None
    interests: list[str] = []          # free-text interest keywords (see Section 7.2 on resolution)
    keywords: list[KeywordEntry]       # segment-specific — becomes one Google ad group
    ad_copy: list[AdCopyVariant]       # segment-specific, 2+ recommended — becomes multiple Meta ads

class CampaignIR(BaseModel):
    campaign_name: str
    objective: Literal["leads", "sales", "traffic", "awareness"]
    daily_budget_usd: float
    end_date: date | None = None
    audience_segments: list[AudienceSegment]   # 1-3 — LLM decides count based on the brief
    call_to_action: str                         # stays campaign-level; doesn't vary meaningfully by segment
    website_url: str | None = None
    negative_keywords: list[str] = []           # stays campaign-level (excluded keywords apply campaign-wide)
    callouts: list[str] = []                    # NEW — short trust phrases, e.g. "Free Shipping", "24/7 Support"
    structured_snippets: dict[str, list[str]] = {}  # NEW — header -> values, e.g. {"Services": ["Repair", "Installation"]}
```

**Removed from the top level:** `audience_description`, `keywords` (flat), `ad_copy` (flat) — all now live inside each `AudienceSegment`. This is a breaking change to every consumer of `CampaignIR` (see the impact map below).

**Segment count:** the LLM decides 1-3 based on whether the brief's business naturally supports distinct audience angles. Don't force a fixed count — a single hyper-local service business may not have a meaningful second segment. The demo (non-LLM) generator should default to 1 segment (it has no basis to invent plausible multiple angles) — this is an acceptable, documented behavior difference between demo and live mode, consistent with how this app already treats "demo mode" as a lesser-fidelity stand-in.

### 2. `GoogleCampaignPlan` — one ad group per segment, plus extensions

```python
# backend/app/schemas/google_plan.py
class GoogleKeyword(BaseModel):
    text: str
    match_type: Literal["exact", "phrase", "broad"] = "phrase"

class GoogleAdGroup(BaseModel):
    name: str
    keywords: list[GoogleKeyword]      # was list[str]
    headlines: list[str]
    descriptions: list[str]

class Sitelink(BaseModel):
    text: str
    url: str
    description: str | None = None

class GoogleCampaignPlan(BaseModel):
    campaign_name: str
    daily_budget_micros: int
    end_date: date | None = None
    final_url: str | None = None
    negative_keywords: list[str] = []
    ad_groups: list[GoogleAdGroup]     # now one per audience segment
    callouts: list[str] = []           # NEW, from CampaignIR.callouts
    structured_snippets: dict[str, list[str]] = {}  # NEW, from CampaignIR.structured_snippets
    sitelinks: list[Sitelink] = []     # NEW, from the client's BrandVoiceProfile (not LLM-generated — see Section 4)
```

### 3. `MetaCampaignPlan` — one ad set per segment, multiple ads per set

```python
# backend/app/schemas/meta_plan.py
class MetaCreative(BaseModel):
    headline: str
    body: str
    call_to_action: str

class MetaAdSet(BaseModel):
    name: str
    daily_budget_cents: int
    targeting_description: str
    age_min: int | None = None
    age_max: int | None = None
    interests: list[str] = []
    creatives: list[MetaCreative]      # was single creative_headline/creative_body/call_to_action

class MetaCampaignPlan(BaseModel):
    campaign_name: str
    objective: str
    website_url: str | None = None
    ad_sets: list[MetaAdSet]           # now one per audience segment
```

### 4. Sitelinks — client-level, agency-entered, not LLM-generated

Sitelinks need real, working URLs to actual pages on the client's site — the LLM can't reliably know these exist, so they're **manually entered by the agency**, same pattern as brand voice (stable per client, not per campaign).

```python
# backend/app/models/brand_voice.py — add to the existing BrandVoiceProfile model
sitelinks: Mapped[list[dict]] = mapped_column(JSON, default=list)  # [{text, url, description}]
```

```python
# backend/app/schemas/brand_voice.py — extend both request/response
class SitelinkInput(BaseModel):
    text: str
    url: str
    description: str | None = None

# add `sitelinks: list[SitelinkInput] = []` to BrandVoiceProfileRequest and
# `sitelinks: list[SitelinkInput]` to BrandVoiceProfileResponse
```

Frontend: extend the existing brand-voice form on `ClientDetailPage.tsx` with a small repeatable sitelink editor (text/url/description fields, add/remove rows) — same interaction pattern already used for `banned_terms`/`required_disclaimers`/`approved_offers` (comma-separated or repeatable-row list, match whichever pattern that form already uses).

At generation/push time, `GoogleCampaignPlan.sitelinks` is populated from `Client.brand_voice_profile.sitelinks` directly — never LLM-generated, never guardrail-checked for content (they're agency-authored facts, not creative copy).

## Generation Pipeline Changes

### `llm_generation.py`

Update `_build_prompt` to ask for the new shape: audience segments (1-3, LLM's judgment), each with its own keywords (with match type), 2+ ad copy variants, and optionally age range + interest keywords. Add `callouts` (3-10 short phrases) and `structured_snippets` (1-2 header/value-list pairs) to the requested JSON. Update the system prompt's schema description to match. Facts still get force-overridden from the brief after generation, same as today (`end_date`, `website_url`, `negative_keywords` — unchanged logic, just check they still target the right IR fields post-restructure).

### `demo_generation.py`

Restructure the deterministic generator to emit exactly one `AudienceSegment` wrapping today's existing single-audience logic (`audience_description` → `segment.description`, `keywords` → `segment.keywords` with default `phrase` match type, the single generated `ad_copy` entry → `segment.ad_copy`). Do not attempt to fabricate a second plausible segment deterministically — one segment in demo mode is fine and expected. `callouts`/`structured_snippets` can stay empty lists in demo mode (no sitelinks either, since those come from `BrandVoiceProfile`, which may or may not be set regardless of demo/live mode).

## Guardrails Changes (`guardrails.py`)

`run_rule_checks` currently iterates `ir.ad_copy` and `ir.keywords` directly — both need to iterate across all segments instead:

```python
all_ad_copy = [copy for segment in ir.audience_segments for copy in segment.ad_copy]
all_keywords = [kw.text for segment in ir.audience_segments for kw in segment.keywords]
```

Banned-term and keyword-overlap checks then run against these flattened lists, same logic as today. Consider (not required) flagging a segment that ends up with zero ad copy variants as its own guardrail warning, since that segment would silently produce a broken/empty ad group or ad set downstream.

## Adapter Changes

### `google_adapter.py`

Loop over `ir.audience_segments`, emit one `GoogleAdGroup` per segment (name derived from `f"{ir.campaign_name} - {segment.name}"`, keywords mapped 1:1 including match type, headlines/descriptions from `segment.ad_copy`). Also map `ir.callouts` → `plan.callouts`, `ir.structured_snippets` → `plan.structured_snippets`. Sitelinks are NOT set here (adapter only sees `CampaignIR`, which has no sitelinks) — they're populated by the caller from the client's `BrandVoiceProfile` after adaptation.

**`adapt_to_google` has two call sites that both need this treatment** — `backend/app/routers/generation.py:44` (initial generation) and `backend/app/routers/approvals.py:39` (re-adapts `body.edited_ir` when a reviewer hand-edits the IR before approving). Both currently have the client already loaded/loadable in scope; both need `google_plan.sitelinks = [Sitelink(**s) for s in client.brand_voice_profile.sitelinks]` (or equivalent) added after the `adapt_to_google(...)` call, guarding for `client.brand_voice_profile` being `None`.

### `meta_adapter.py`

Loop over `ir.audience_segments`, emit one `MetaAdSet` per segment (name derived the same way, `targeting_description` from `segment.description`, `age_min`/`age_max`/`interests` copied through, `creatives` from ALL of `segment.ad_copy` — no more `[0]`-only truncation).

## Real Push Client Changes

### 7.1 Google — keyword match types + extension assets

`google_ads_client.py`: replace the hardcoded `KeywordMatchTypeEnum.PHRASE` with a per-keyword lookup (`{"exact": EXACT, "phrase": PHRASE, "broad": BROAD}`) driven by `GoogleKeyword.match_type`.

For extensions, the modern Google Ads API (v14+, matches the `google-ads>=25.0.0` pin) uses the **Asset** model: create standalone assets via `AssetService.mutate_assets` (one `asset_operation` per callout / structured snippet / sitelink — `CalloutAsset.callout_text`, `StructuredSnippetAsset.header`/`values`, `SitelinkAsset.link_text`/`description1`/`description2` + the asset's own `final_urls`), then link each created asset to the campaign via `CampaignAssetService.mutate_campaign_assets` (`campaign_asset.create` = `{campaign: <resource_name>, asset: <asset_resource_name>, field_type: CALLOUT | STRUCTURED_SNIPPET | SITELINK}`). **Verify the exact proto field names against the installed SDK version before implementing** — this is the right API surface but exact syntax should be confirmed against current docs/SDK, not copied verbatim from this spec.

### 7.2 Meta — structured targeting + multi-ad ad sets

`meta_ads_client.py`: replace the hardcoded `{"geo_locations": {"countries": ["US"]}, "age_min": 18, "age_max": 65}` targeting block with `ad_set.age_min`/`ad_set.age_max` (fall back to the current 18/65 defaults if unset) plus resolved interests.

**Interest resolution is required — do not pass free-text interest names directly to Meta's targeting spec, they will be rejected.** For each `ad_set.interests` entry, call the Targeting Search endpoint before building the ad set's targeting:

```python
GET https://graph.facebook.com/<version>/search?type=adinterest&q=<keyword>&limit=1&access_token=<token>
```

Take the top match's `id`/`name` if present; skip (don't fail the whole push) any interest keyword with no match — log or record it so the agency can see which interests didn't resolve, similar to how other soft-fail conditions are surfaced today. Build `targeting.flexible_spec` from whatever interests resolved. This endpoint runs under the same `ads_management` permission already granted to this app — no new Meta App Review needed.

For multiple ads per ad set: replace the current single `create_ad_creative` + `create_ad` call with a loop over `ad_set.creatives`, creating one `AdCreative` + one `Ad` per creative, all pointed at the same `adset_id`. Name each uniquely (e.g. `f"{ad_set.name} Ad {index+1}"`) to avoid collisions.

## Frontend Impact

- `frontend/src/lib/types.ts` — mirror every backend schema change: `AudienceSegment`, `KeywordEntry`/`GoogleKeyword`, `Sitelink`, `MetaCreative`, updated `GoogleCampaignPlan`/`MetaCampaignPlan`.
- `frontend/src/lib/apiClient.http.ts` — update `RawGooglePlan`/`RawMetaPlan`/`toGooglePlan`/`toMetaPlan` mapping for the new nested shapes.
- `frontend/src/components/CampaignPlanViews.tsx` — `GooglePlanView`/`MetaPlanView` need real changes: render per-segment ad groups/ad sets (already loops over `ad_groups`/`ad_sets`, so the loop survives — just the per-item content grows), render each ad group's keywords with their match type badge, render multiple Meta creatives per ad set instead of one, and add new sections for callouts/structured_snippets/sitelinks on the Google side.
- `frontend/src/pages/ClientDetailPage.tsx` — add the sitelinks editor to the existing brand-voice form.
- `frontend/src/pages/NewBriefPage.tsx` — the `duplicateFrom` prefill (added in the retention-features round) reads fields off `DraftDetail` that come from `Brief`, not `CampaignIR`/plans — unaffected by this change, no update needed there.

## Full Impact / File Map

| File | Change |
|---|---|
| `backend/app/schemas/campaign_ir.py` | Restructure `CampaignIR`, add `AudienceSegment`, `KeywordEntry` |
| `backend/app/schemas/google_plan.py` | Add `GoogleKeyword`, `Sitelink`; `GoogleAdGroup.keywords` type change; new plan fields |
| `backend/app/schemas/meta_plan.py` | Add `MetaCreative`; `MetaAdSet` restructure |
| `backend/app/schemas/brand_voice.py` + `app/models/brand_voice.py` | Add `sitelinks` |
| `backend/app/services/llm_generation.py` | New prompt shape |
| `backend/app/services/demo_generation.py` | Wrap existing logic in one `AudienceSegment` |
| `backend/app/services/guardrails.py` | Flatten across segments before checking |
| `backend/app/services/google_adapter.py` | Loop per segment; map extensions |
| `backend/app/services/meta_adapter.py` | Loop per segment; no more `ad_copy[0]` truncation |
| `backend/app/services/google_ads_client.py` | Per-keyword match type; new Asset-creation calls |
| `backend/app/services/meta_ads_client.py` | Structured targeting + interest resolution; multi-ad loop |
| `backend/app/routers/generation.py:44` and `backend/app/routers/approvals.py:39` | Both call `adapt_to_google` — both need to populate `GoogleCampaignPlan.sitelinks` from the client's `BrandVoiceProfile` after adaptation |
| `frontend/src/lib/types.ts`, `apiClient.http.ts` | Mirror all schema changes |
| `frontend/src/components/CampaignPlanViews.tsx` | Render segments, match types, multi-creative, extensions |
| `frontend/src/pages/ClientDetailPage.tsx` | Sitelinks editor |
| `backend/app/services/projections.py` | **No change** — only reads `daily_budget_usd` |

## Phased Build Order

Each phase is independently shippable and testable; later phases build on earlier ones but don't block them.

1. **Audience segments + multi-creative structure.** The core `CampaignIR`/plan restructure, both generators, guardrails, both adapters, and updating both push clients to loop over segments (still with today's hardcoded match-type/targeting — just structurally correct now). This alone fixes the "Meta throws away every ad copy variant past the first" bug and delivers the "2 versions for different audiences" ask. Frontend types + plan-view rendering must land in this phase too (the API shape changes, nothing else can work until the frontend can read it).
2. **Google extensions** — callouts, structured snippets, sitelinks (including the client-level data model + UI).
3. **Google keyword match types** — small, contained, purely additive on top of the Phase 1 structure.
4. **Meta structured targeting** — age range (trivial) + interest resolution (the new Targeting Search call) + multi-ad-per-ad-set push logic.

## Testing

Per this repo's established TDD convention: red-green per change, full suites (`pytest`, `vitest`, `tsc -b`) before considering any phase done. `RealGoogleAdsPushClient`/`RealMetaAdsPushClient` are not exercised by the fast suite (require monkeypatching `GoogleAdsClient.load_from_dict`/`FacebookAdsApi.init` while still constructing real proto-plus/SDK message types, per the existing pattern in `test_google_ads_client.py`/`test_meta_ads_client.py` — extend those files' pattern for the new Asset/interest-search calls rather than inventing a new one).

**Phase 1 will break every existing test that constructs a `CampaignIR` with the old flat kwargs** (`keywords=[...]`, `audience_description=...`, `ad_copy=[...]` at the top level) — this is expected, not a regression to chase. Nine files do this today and all need updating to the new `audience_segments=[AudienceSegment(...)]` shape as part of Phase 1, not left broken: `test_guardrails.py`, `test_launch_route.py`, `test_client_portal.py`, `test_guardrails_route.py`, `test_projections.py`, `test_meta_adapter.py`, `test_google_adapter.py`, `test_campaign_push.py`, `test_approvals.py`. For example, `test_google_adapter.py`'s current

```python
ir = CampaignIR(
    campaign_name="Austin Bakery Foot Traffic", objective="traffic", daily_budget_usd=16.5,
    keywords=["bakery near me", "austin pastries"], audience_description="Adults 25-54 near Austin",
    ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
    call_to_action="Visit Us Today",
)
```

becomes something like

```python
ir = CampaignIR(
    campaign_name="Austin Bakery Foot Traffic", objective="traffic", daily_budget_usd=16.5,
    audience_segments=[AudienceSegment(
        name="Primary", description="Adults 25-54 near Austin",
        keywords=[KeywordEntry(text="bakery near me"), KeywordEntry(text="austin pastries")],
        ad_copy=[AdCopyVariant(headline="Fresh Pastries Daily", description="Visit today.")],
    )],
    call_to_action="Visit Us Today",
)
```

and assertions like `plan.ad_groups[0].keywords == ["bakery near me", "austin pastries"]` become `[k.text for k in plan.ad_groups[0].keywords] == [...]` (or assert on the full `GoogleKeyword` objects including `match_type`).

## Explicitly Out of Scope

- Full Meta interest *browsing*/autocomplete UI for the agency (only backend name→ID resolution at push time).
- Google Performance Max, Display, or Video campaign types — Search only, matching this app's current scope.
- Per-segment call-to-action variation (CTA stays campaign-level).
- Any change to `projections.py`'s estimated-performance figures.
