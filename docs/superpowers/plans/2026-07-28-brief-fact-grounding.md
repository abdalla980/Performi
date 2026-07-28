# Brief Fact-Grounding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agencies enter real services, trust signals, and customer types on the brief so generated callouts / structured snippets / audience segment names are fact-grounded — not LLM inventions — with a guardrail warning when extensions still ship without backing facts.

**Architecture:** Add three optional JSON fields on `Brief`. Frontend collects them (comma-separated lists + sitelinks-style hint rows). After LLM parse (and in demo generation), force-override IR `callouts` / `structured_snippets` / segment name+description from the brief — same pattern as `end_date` / `website_url` / `negative_keywords`. Guardrails compare IR extensions against brief fact fields and warn when content is unverified.

**Tech Stack:** Existing FastAPI/SQLAlchemy/Pydantic stack, React brief form, Vitest/pytest.

**Spec:** `docs/superpowers/specs/2026-07-28-brief-fact-grounding-design.md`

## Global Constraints

- All three fields optional, default empty — empty ⇒ today's LLM/demo behavior.
- Do **not** merge agency facts with LLM callouts/snippets — **replace entirely** when provided.
- Audience hints force **name/description only**; keep LLM keywords/ad_copy/interests.
- `zip(segments, hints)` for overrides: update overlapping pairs only (no crash if counts differ).
- Do **not** merge `trust_signals` into `unique_selling_points` — distinct concepts.
- Reuse `excludedKeywords` split/trim/filter for list fields; reuse ClientDetail sitelinks add/remove for audience hints.
- Soft UI suggestion of max 3 customer types — no backend cap.
- Manual `ALTER TABLE briefs` on live `dev.db` required (no migration tool). Verify after implement.
- Out of scope: license DB validation; retroactive regen of launched campaigns.

---

## File Structure

```
backend/app/models/brief.py
backend/app/schemas/brief.py              # AudienceHint + fields on create + DraftDetailResponse
backend/app/routers/briefs.py             # persist + detail response
backend/app/services/llm_generation.py    # prompt + force-override
backend/app/services/demo_generation.py   # use facts when present
backend/app/services/guardrails.py        # unverified_* warns; take brief
backend/app/routers/guardrails.py         # pass draft.brief
frontend/src/lib/types.ts
frontend/src/lib/apiClient.http.ts
frontend/src/pages/NewBriefPage.tsx
tests: test_llm_generation, test_demo_generation, test_guardrails, test_briefs, NewBriefPage.test
```

---

### Task 1: Brief model + schemas + API persistence

**Files:**
- Modify: `backend/app/models/brief.py`, `schemas/brief.py`, `routers/briefs.py`
- Test: `backend/tests/test_briefs.py`

**Interfaces:**
- `AudienceHint(name: str, description: str)`
- `BriefCreateRequest` / `DraftDetailResponse` gain `services_offered`, `trust_signals`, `audience_hints`

- [ ] **Step 1: Failing brief create/detail test asserting the three fields round-trip**

- [ ] **Step 2: Add columns + schema + `_create_one` / detail mapping**

- [ ] **Step 3: `pytest tests/test_briefs.py -q`**

- [ ] **Step 4: Commit** `feat: add brief services, trust signals, and audience hints fields`

---

### Task 2: LLM + demo force-override

**Files:**
- Modify: `llm_generation.py`, `demo_generation.py`
- Test: `test_llm_generation.py`, `test_demo_generation.py`

**Interfaces:**
- After IR parse: if `trust_signals` → `ir.callouts = list(...)`; if `services_offered` → `ir.structured_snippets = {"Services": ...}`; if `audience_hints` → zip-rename segments
- Demo: build segments from hints when present; set callouts/snippets from facts; else keep one generic segment + empty extensions

- [ ] **Step 1: Tests — facts replace LLM output; absent facts leave prior behavior**

- [ ] **Step 2: Implement prompt + overrides + demo path**

- [ ] **Step 3: `pytest tests/test_llm_generation.py tests/test_demo_generation.py -q`**

- [ ] **Step 4: Commit** `feat: force-pass brief facts into generated campaign IR`

---

### Task 3: Unverified-extension guardrails

**Files:**
- Modify: `guardrails.py`, `routers/guardrails.py`
- Test: `test_guardrails.py`

**Interfaces:**
- `run_rule_checks(ir, brand_voice, brief: Brief | None = None)`
- Warn `unverified_callouts` / `unverified_structured_snippets` only when IR has content and corresponding brief list is empty

- [ ] **Step 1: Tests for warn / no-warn cases**

- [ ] **Step 2: Implement + update call site**

- [ ] **Step 3: `pytest tests/test_guardrails.py -q`**

- [ ] **Step 4: Commit** `feat: warn when callouts/snippets lack agency fact grounding`

---

### Task 4: Frontend brief form + apiClient

**Files:**
- Modify: `types.ts`, `apiClient.http.ts`, `NewBriefPage.tsx` (+ tests)

**Interfaces:**
- `BriefInput` / `DraftDetail`: `servicesOffered`, `trustSignals`, `audienceHints: {name, description}[]`
- Form: two comma inputs + repeatable customer-type rows; `duplicateFrom` prefills all three

- [ ] **Step 1: Update apiClient + NewBriefPage tests**

- [ ] **Step 2: Implement UI + mapping**

- [ ] **Step 3: `npm test -- --run` + `npx tsc -b`**

- [ ] **Step 4: Commit** `feat: collect brief fact fields on New Brief form`

---

### Task 5: Live `dev.db` ALTER + push

```sql
ALTER TABLE briefs ADD COLUMN services_offered JSON DEFAULT '[]';
ALTER TABLE briefs ADD COLUMN trust_signals JSON DEFAULT '[]';
ALTER TABLE briefs ADD COLUMN audience_hints JSON DEFAULT '[]';
```

- [ ] **Step 1: Apply ALTER if columns missing**

- [ ] **Step 2: Full backend + frontend suites green**

- [ ] **Step 3: Push to `main`**

---

## Self-Review

1. Spec coverage: fields ✓, frontend ✓, LLM override ✓, demo ✓, guardrail ✓, migration note ✓, out-of-scope left out ✓.
2. No placeholders.
3. Naming: `trust_signals` ≠ `unique_selling_points`; force-replace not merge.
