# Brief Fact-Grounding — Design

## Context & Goal

The campaign-quality upgrade (`docs/superpowers/specs/2026-07-28-campaign-quality-upgrade-design.md`, already implemented) added real Google extensions (callouts, structured snippets), real Meta structured targeting, and multi-segment audience generation. **All of it is generated from the exact same thin brief inputs as before** — `business_description`, `goals`, one free-text `target_audience` field. Nothing changed on the input side, so the LLM is inventing callouts, structured snippets, and audience segments from a paragraph of description rather than being told real facts about the business.

This is more than a cosmetic gap. **Callouts and structured snippets are supposed to be true claims** ("Licensed & Insured," "24/7 Support," "Services: Repair, Installation, Maintenance"). An LLM inventing "24/7 Support" for a business that doesn't actually offer that is a false claim in a live ad — exactly the class of problem this app's guardrail system exists to catch, but it was never taught to check for this specific case. Audience segments have the same issue one level down: with only one generic `target_audience` string as input, the "2 versions for different audiences" feature has to invent both angles from the same paragraph instead of being grounded in customer types the agency actually knows about.

**Principle, consistent with how sitelinks were already built:** facts about the business (real services, real credentials, real customer types) come from the agency, not the LLM. The LLM's job stays creative — ad copy, keyword generation, tone — not inventing facts it can't verify.

## Current State (reference)

- `backend/app/models/brief.py:10-29` — `Brief`: `business_description`, `budget_usd`, `goals`, `website_url`, `target_location`, `target_audience` (single free-text string), `end_date`, `platforms`, `competitors` (free text), `unique_selling_points` (free text), `excluded_keywords` (list).
- `backend/app/schemas/brief.py` — `BriefCreateRequest` mirrors the model 1:1, snake_case.
- `frontend/src/pages/NewBriefPage.tsx` — `BriefRow` interface mirrors the same fields camelCase; `excludedKeywords` is entered as a comma-separated `Input` (`toBriefInput`'s `.split(',').map(trim).filter(Boolean)` — reuse this exact pattern for the new list fields, don't invent a different parsing convention).
- `frontend/src/pages/ClientDetailPage.tsx` (sitelinks editor, added in the campaign-quality-upgrade round) — the precedent for how a **repeatable, agency-entered fact list** should look and behave in this app: add/remove rows, each row a small set of labeled inputs, saved as a JSON list. Reuse this same interaction pattern for audience hints below, don't invent a new one.
- `backend/app/services/llm_generation.py:12-42` (`_build_prompt`) — already has an established pattern for "facts, not creative content, trust the brief over the model" at the bottom of `generate_campaign_ir`: `end_date`, `website_url`, and `negative_keywords` are force-overridden from the brief *after* generation, regardless of what the LLM produced. This spec extends that exact same pattern to `callouts`, `structured_snippets`, and segment names/descriptions.
- `backend/app/services/demo_generation.py` — deterministic generator, currently has no basis to produce real callouts/structured snippets/multiple segments (produces one generic segment, empty callouts/snippets). This spec gives it real material to work with when the agency provides it.
- `backend/app/services/guardrails.py` — `run_rule_checks` is where a new "unverified content" flag belongs.

## Target Design

### 1. New `Brief` fields

```python
# backend/app/models/brief.py — add:
services_offered: Mapped[list[str]] = mapped_column(JSON, default=list)   # real services/products, e.g. ["Drain repair", "Water heater installation", "Emergency plumbing"]
trust_signals: Mapped[list[str]] = mapped_column(JSON, default=list)       # real, verifiable short claims, e.g. ["Licensed & Insured", "Free Estimates", "24/7 Emergency Service"]
audience_hints: Mapped[list[dict]] = mapped_column(JSON, default=list)     # [{name, description}] — real distinct customer types, 0-3 entries
```

```python
# backend/app/schemas/brief.py
class AudienceHint(BaseModel):
    name: str            # e.g. "Homeowners with plumbing emergencies"
    description: str     # e.g. "Need same-day service, price-sensitive but urgency-driven"

# add to BriefCreateRequest:
services_offered: list[str] = []
trust_signals: list[str] = []
audience_hints: list[AudienceHint] = []
```

All three are **optional and default empty** — a simple, single-service business shouldn't be forced to fill these in. Everything downstream degrades gracefully to today's LLM-inferred behavior when they're empty (see Section 3).

**Naming distinction, worth getting right:** `unique_selling_points` (already exists) is positioning/differentiation prose that feeds general ad messaging — keep it as-is, don't merge it with `trust_signals`. `trust_signals` are specifically short (2-4 word), Google-callout-shaped, individually-verifiable claims. A USP like "Family-owned for three generations, we treat every job like it's our own home" is not a callout; "Family-Owned" is.

### 2. Frontend — `NewBriefPage.tsx`

Add two comma-separated text inputs, same pattern as the existing `excludedKeywords` field (`toBriefInput`'s split/trim/filter):

```
Label: "Services offered (comma-separated)"       Placeholder: "Drain repair, Water heater installation, Emergency plumbing"
Label: "Trust signals / credentials (comma-separated)"   Placeholder: "Licensed & Insured, Free Estimates, 24/7 Service"
```

Add a repeatable "Known customer types (optional)" section, same add/remove-row pattern as the sitelinks editor on `ClientDetailPage.tsx`: each row is a `name` input + `description` input, "Add customer type" button, max-3 is a soft UI suggestion not a hard limit (backend doesn't need to enforce a cap — if an agency enters more, generate more segments; no need to reject it).

`BriefRow` gains `servicesOffered: string`, `trustSignals: string` (both raw comma-separated strings in local state, same as `excludedKeywords` today), and `audienceHints: Array<{ name: string; description: string }>`. `toBriefInput` parses the two comma-separated fields the same way `excludedKeywords` already is.

Also update the `duplicateFrom` prefill logic (added in the retention-features round) to carry these three new fields through when refreshing a stale campaign — it already prefills every other brief field from the source draft; these three should not be an exception.

### 3. Generation pipeline — facts override creativity, not the other way around

**`llm_generation.py`:** add the three new fields to `_build_prompt`, with explicit instructions distinguishing what's a fact vs. what the LLM should invent:

```
Real services this business offers (use these verbatim for structured snippets, do not invent additional ones): {services_offered or "(not provided — infer plausible categories from the business description)"}
Real, verified trust signals/credentials (use these verbatim for callouts, do not invent unverifiable claims): {trust_signals or "(not provided — you may generate plausible generic callouts, but nothing that claims a specific certification/hours/guarantee you cannot verify)"}
Known distinct customer types (generate exactly one audience segment per entry below, using the given name/description as that segment's targeting basis — only invent additional segments if none are listed here): {audience_hints or "(not provided — infer 1-3 plausible segments from the business description)"}
```

Then, **after** parsing the LLM's JSON response — same place and same pattern as the existing `end_date`/`website_url`/`negative_keywords` force-override at the bottom of `generate_campaign_ir` — apply facts over whatever the model produced:

```python
if brief.trust_signals:
    ir.callouts = list(brief.trust_signals)   # replace LLM output entirely — don't merge, don't trust its judgment on which of its own were "safe"
if brief.services_offered:
    ir.structured_snippets = {"Services": list(brief.services_offered)}
if brief.audience_hints:
    # Force each segment's name/description to match the hint it corresponds to;
    # keep the LLM's generated keywords/ad_copy/interests for that segment as-is —
    # those are the creative part it's actually good at and has no "fact" to get wrong.
    for segment, hint in zip(ir.audience_segments, brief.audience_hints):
        segment.name = hint.name
        segment.description = hint.description
```

The `zip` assumes the LLM generated exactly `len(audience_hints)` segments when hints were provided, per the prompt instruction above — if it generated a different count, that's a real "didn't follow instructions" case; decide (implementer's call, not load-bearing either way) whether to truncate/pad or leave as a guardrail warning rather than crashing.

**`demo_generation.py`:** this is strictly easier here than the LLM path — no prompt-following risk. When `services_offered`/`trust_signals`/`audience_hints` are present, use them directly instead of the current empty/single-segment defaults. When absent, keep exactly today's behavior (one generic segment, empty extensions) — no regression for the common case.

### 4. New guardrail: flag unverified extensions

`run_rule_checks` (`guardrails.py`) gets one new check: if `ir.callouts` or `ir.structured_snippets` are non-empty **but the corresponding brief field was empty**, that content is LLM-invented, not agency-verified — flag it so a reviewer knows to double-check before approving, rather than silently trusting AI-generated claims:

```python
if ir.callouts and not brief.trust_signals:
    flags.append(GuardrailFlag(
        severity="warn", code="unverified_callouts",
        message="Callouts were AI-generated, not agency-provided — verify these claims are accurate before approving.",
    ))
if ir.structured_snippets and not brief.services_offered:
    flags.append(GuardrailFlag(
        severity="warn", code="unverified_structured_snippets",
        message="Structured snippets were AI-generated, not agency-provided — verify these are real services before approving.",
    ))
```

Note `run_rule_checks`'s current signature is `(ir: CampaignIR, brand_voice: BrandVoiceProfile | None)` (`backend/app/services/guardrails.py:19`) — it needs the `Brief` (or just the three new fields) passed in too, to compare against. It has exactly one call site: `backend/app/routers/guardrails.py:37` — update the signature and that call together.

## Impact Map

| File | Change |
|---|---|
| `backend/app/models/brief.py` | 3 new JSON columns |
| `backend/app/schemas/brief.py` | `AudienceHint`, 3 new fields on `BriefCreateRequest` — `BriefBatchCreateRequest` just wraps `briefs: list[BriefCreateRequest]`, so it inherits the new fields automatically, no separate change needed there |
| `backend/app/services/llm_generation.py` | Prompt additions + post-generation force-override |
| `backend/app/services/demo_generation.py` | Use real facts when present, else unchanged behavior |
| `backend/app/services/guardrails.py` | Two new `warn` flags; signature needs the brief's fact fields |
| `backend/app/routers/briefs.py` (or wherever `run_rule_checks` is called) | Pass the new fields through |
| `frontend/src/lib/types.ts`, `apiClient.http.ts` | Mirror `servicesOffered`/`trustSignals`/`audienceHints` on `BriefInput`/`DraftDetail` |
| `frontend/src/pages/NewBriefPage.tsx` | Two comma-separated inputs + repeatable customer-type rows (reuse `ClientDetailPage.tsx`'s sitelinks-row pattern); extend `duplicateFrom` prefill |

## Migration Notes

Three new JSON columns on the existing `briefs` table — same "no migration tool" situation as every prior schema change in this repo. Add via manual `ALTER TABLE briefs ADD COLUMN ... JSON DEFAULT '[]'` against any `dev.db` that predates this change (check this directly after implementing — the last two rounds both had a live `dev.db` gap that had to be caught and fixed by hand).

## Testing

Per this repo's TDD convention. Specifically worth a real test each for: (1) when `trust_signals`/`services_offered` are provided, the LLM's own callout/snippet output is fully replaced, not merged; (2) when they're absent, behavior is unchanged from before this spec; (3) the new guardrail flags fire only when content exists without a corresponding fact field, not otherwise; (4) `demo_generation.py` uses provided facts directly.

## Explicitly Out of Scope

- Any cap/limit on how many services, trust signals, or audience hints an agency can enter — no artificial ceiling, just UI affordance suggesting keeping it reasonable.
- Structured, platform-specific validation of trust signals (e.g. checking "Licensed & Insured" against a real license database) — this is agency self-attestation, same trust level as everything else the agency enters (brand voice, sitelinks).
- Retroactively re-generating already-launched campaigns with the new fields — this only affects campaigns generated after this ships.
