# Design: Agency Batch Campaign Generator

Date: 2026-07-07
Status: Approved for planning

## Context

`docs/market-research.md` (automated research pass, 2026-07-07) found no startup doing the full "OAuth connect → text brief → LLM-generated campaign → API push" workflow end-to-end for Google Ads. The real competitive pressure is Google's own native AI tools (Ask Advisor, AI Brief, Gemini campaign builder), which target solo/SMB advertisers directly inside the free Google Ads console. That doc's recommendation: building for your own accounts is low-risk; the more defensible commercial pivot is **agency/multi-account workflow tooling** — batch campaign generation, QA, and brand consistency across many client accounts — rather than the single-account "text in, campaign out" wrapper Google is commoditizing.

A follow-up research pass (this session, sourced from G2, Capterra, Indie Hackers, Product Hunt, and industry blogs — Reddit was inaccessible from this environment and remains unverified) validated the agency angle with concrete, sourced pain points:

1. Agencies rebuild the same campaign structure per client and per channel — estimated ~75% of campaign-setup time is repetitive rebuilding. ([fluency.inc](https://www.fluency.inc/blog/multichannel-campaign-management-google-ads-meta-ads-automation))
2. Google and Meta bulk-upload formats are genuinely incompatible (different schemas; Meta's importer fails on stray characters), forcing manual double work. (same source)
3. Campaign QA breaks down structurally at multi-account scale — no one owns it, and nuance is lost between strategist and media buyer handoff. ([growth-rocket.com](https://www.growth-rocket.com/blog/common-campaign-qa-mistakes-and-how-agencies-avoid-them/))
4. Budget-configuration errors are the most damaging mistakes and compound with account count (extra zero, no end date, wrong locale). ([grasp.gg](https://grasp.gg/blog/2021/05/3-most-scary-media-buying-mistakes/))
5. Existing all-in-one tools (e.g. Smartly.io) price out agencies (~$5K/mo+, % of spend); per-client fee stacking on other tools erodes agency margins. ([G2](https://www.g2.com/products/smartly/reviews))
6. AI-generated ad creative is frequently criticized as generic/off-brand. ([zeely.ai](https://zeely.ai/blog/adcreative-review/))
7. Thin "suggestion only" tools (e.g. Adzooma) are dismissed as no better than free native recommendations. (Capterra/Trustpilot reviews)

Together, these point to the same conclusion as the original research but sharpen it: batch generation alone is not enough. Without built-in QA guardrails and brand-voice fidelity, this product walks straight into complaints 3, 4, 6, and 7 instead of solving 1 and 2.

## Goal

Let an agency generate and launch Google Ads **and** Meta Ads campaigns for many of their clients at once, from a short per-client brief, safely enough that errors don't compound with client count and output doesn't read as generic.

## Target user & rollout model

- **Primary user:** other agencies (multi-tenant product, sold to agencies who each manage many client ad accounts) — not solo/SMB advertisers marketing their own single product. That segment is architecturally supported later (an "agency" of one managing a single "client" is the same data shape) but is explicitly **not** the v1 target: it's the segment Google's native tools (Ask Advisor, AI Brief) are built to serve directly, making it the least defensible starting point per the research.
- **Rollout model:** hand-onboarded pilot agencies. No public self-serve signup, no billing, no marketing site in v1. Rationale: OAuth sensitive-scope verification is slower and stricter for public multi-tenant apps (10+ days, demo video, written justification per scope per `docs/market-research.md` §5); piloting with real usage first is lower-risk and produces testimonials while that review path is evaluated.
- **Platform scope:** Google Ads and Meta Ads both from v1 (not sequenced), since most target agencies run both and a single-platform tool doesn't remove the #1 and #2 pain points above.

## Platform approval requirements

Because this is a public multi-tenant app managing ad accounts belonging to businesses other than our own, both platforms require formal approval before it can be used with a pilot agency's own independent ad accounts — this is a hard prerequisite, not something engineering effort shortens, so it should start in parallel with the backend build (Plan 1), not after.

**Google Ads API** (per `docs/market-research.md` §5):
- A 22-character developer token from a Google Ads manager account, tiered Test/Explorer → Basic → Standard, each needing separate Google review.
- The token needs approval specifically for "Ad creation/management," not just "Reporting" (read-only) — this product publishes campaigns.
- OAuth sensitive-scope verification: 10+ days, requires an unlisted demo video of the OAuth consent flow plus written justification per scope.

**Meta Marketing API** (researched this session, sourced from developers.facebook.com unless noted):
- Requires **App Review** for Advanced Access to `ads_management` — Standard Access only works for ad accounts that are already owners/admins on the app's own Business Manager, which doesn't cover independent pilot agencies' accounts.
- Separately requires **Business Verification** (mandatory since Feb 2023) — legal business documents (registration, tax ID) proving the business behind the app, distinct from and in addition to App Review.
- No official Meta timeline; third-party estimates (unconfirmed) suggest roughly 1–4 weeks combined for both approvals.
- Point-based rate limits apply per app+ad account (Dev tier cap 60pts, Standard tier cap 9,000pts per 300s); reaching the higher tier now additionally requires ≥500 Marketing API calls in the trailing 15 days at <15% error rate (policy effective May 4, 2026) — achievable naturally once pilot usage is real, but worth knowing about in advance.

**Until both approvals land**, the tool can only connect ad accounts manually added as testers/admins (our own sandbox accounts, or a pilot agency's accounts added directly as collaborators) — it cannot yet onboard an arbitrary outside agency's independently-owned ad account. This is the same population of accounts Plan 1's Task 13 sandbox test already relies on, so no extra setup is needed to start testing — but it does mean the *first fully self-service pilot agency* (connecting their own accounts without us adding them as a collaborator) is gated on these approvals landing, not on any remaining engineering work.

## Non-goals (v1)

- Self-serve signup, billing, or a public marketing site.
- Continuous post-launch optimization or reporting (the "unified reporting layer" approach considered and not chosen — see below).
- Direct-to-SMB / solo-advertiser positioning.

## Approaches considered

1. **Guarded generation (chosen):** brief → brand-voice-aware LLM generation → automated guardrail checks → human approval → bulk push → audit log.
2. **Lean generate-and-push:** same pipeline without guardrails/approval in v1. Rejected — faster to a first pilot, but reproduces pain points 3, 4, 6, 7 on real client accounts before any safety net exists.
3. **Template-cloning engine:** clone one proven campaign across clients/channels via variable substitution + light AI copy variation instead of freeform per-client generation. Rejected as the primary approach — cheaper and more predictable, but weaker for clients with genuinely different businesses and closer to the "glorified bulk uploader" category already criticized (pain point 7). May be worth revisiting as an optional faster path for near-identical clients (e.g. franchises) after v1.

Also considered and rejected as the core job: a QA/guardrail-only monitoring product with no generation, and a unified cross-account reporting/optimization layer (already the most crowded category — Optmyzr, Madgicx, Revealbot). Batch generation was chosen as the core job because it most directly addresses pain point 1, the most frequently cited complaint.

## Data model

- **Agency** — the tenant (a customer of this product).
- **Client** — one of the Agency's end customers; holds Google Ads and Meta OAuth credentials, scoped to exactly one Agency.
- **BrandVoiceProfile** — one per Client: tone, banned words/phrases, required disclaimers, currently-approved offers.
- **Brief** — a business description, budget, and goals submitted for one Client; briefs can be submitted individually or as a batch (e.g. CSV) covering many Clients at once.
- **CampaignDraft** — LLM output: a platform-agnostic intermediate representation, plus a Google Ads–shaped version and a Meta Ads–shaped version derived from it.
- **GuardrailReport** — automated check results against a CampaignDraft: hard-stop flags (block progress) and soft warnings (require acknowledgment, don't block).
- **Approval** — records who reviewed a CampaignDraft, what they edited, and their approve/reject decision.
- **LaunchRecord** — per-Client, per-platform push status (success / partial / failed), since a batch push must not be all-or-nothing.
- **AuditLog** — immutable trail from Brief through CampaignDraft, GuardrailReport, Approval, to final live state, timestamped.

## Pipeline

1. Agency submits a batch of Briefs (one per Client, or many at once).
2. LLM generates a platform-agnostic CampaignDraft per Brief, conditioned on that Client's BrandVoiceProfile.
3. Platform adapters convert the draft into a Google Ads structure (keywords, ad groups, headlines, targeting, budget) and a Meta structure (ad sets, audiences, creative) — this layer absorbs the schema-incompatibility problem (pain point 2) instead of leaving it to the user.
4. The guardrail engine runs automatically: rule-based checks (budget bounds, required UTM parameters, banned terms, missing end dates) plus an LLM semantic check (off-brand tone, off-topic copy). Produces hard-stop flags vs. soft warnings.
5. A human reviewer sees the draft alongside guardrail flags, can edit inline, and approves or rejects per Client. Nothing publishes without explicit approval.
6. Approved drafts are pushed via the Google Ads API and the Meta Marketing API. Push status is tracked per Client — a partial batch failure doesn't block or roll back the Clients that succeeded.
7. Every step is written to the AuditLog.

## Architecture

- **Frontend:** React/Vite, consistent with the prior MVP.
- **Backend:** Python service — both the Google Ads API and Meta Marketing API have mature Python SDKs, and Python's LLM tooling is strong. Consistent with the prior MVP's FastAPI backend.
- **Database:** Postgres, replacing the prior MVP's mock JSON files. Pilot agencies' Client data and OAuth credentials need durable, encrypted-at-rest storage — mock files are no longer acceptable once real client accounts are connected.
- **Background job queue:** required for batch generation and batch push. Publishing N Clients to two ad platforms involves per-platform rate limits and retries and cannot block the UI on a synchronous request.
- **Credentials:** OAuth tokens stored per Client, encrypted at rest, scoped so one Agency cannot access another Agency's Client credentials.

## Error handling

- **Expired/revoked OAuth:** surfaced per-Client ("this client needs to reconnect Google/Meta"), not a silent whole-batch failure.
- **Partial batch push failure:** each Client's push status is independently visible; failed Clients can be retried without re-touching succeeded ones.
- **Platform rate limiting:** the push worker paces requests and retries with backoff rather than failing the batch.
- **Guardrail hard-stops:** block publishing with no override. Soft warnings require the reviewer to see and acknowledge them but don't block.

## Testing

- Run the full pipeline against Google Ads and Meta's official sandbox/test accounts before any real budget is at risk.
- Maintain a set of deliberately bad briefs (typo'd budget, banned word, missing required field) as guardrail regression tests, to prove the checks catch what they're meant to catch.
- First real rollout: one pilot agency, a small batch of their real Clients (2-3), before their full client roster.

## Open questions / future work

- Real-world agency sentiment from Reddit (r/PPC, r/agency, r/adops) was not obtainable in this research pass (site blocked from this environment) — worth a manual follow-up pass.
- Template-cloning (rejected approach 3) may be worth adding later as a faster optional path for clients with near-identical campaign needs (e.g. franchise/multi-location businesses).
- Direct-to-SMB positioning is architecturally possible (one-Client Agency) but intentionally deferred — revisit only if pilot agencies validate the core workflow and a distinct SMB-facing product is deliberately scoped later.
- Self-serve signup, billing, and public OAuth consent review are deferred until pilot usage validates the workflow.
