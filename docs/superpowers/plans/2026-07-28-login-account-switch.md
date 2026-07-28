# Login Account Switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a session already exists, `/login` shows an interstitial (continue or log out) instead of silently redirecting.

**Architecture:** One-file UI change on `LoginPage.tsx` using existing `logout()` from `useAuth`. After logout, session clears and the same page shows `LoginForm`.

**Tech Stack:** React Router `Link`, existing `Button` / `buttonVariants`.

**Spec:** `docs/superpowers/specs/2026-07-28-login-account-switch-design.md`

## Global Constraints

- No changes to `supabaseClient.ts` storage / multi-session.
- Dual agency+client tabs remain out of scope.

---

### Task 1: Interstitial + test

- Replace `<Navigate>` with interstitial per spec.
- Create `LoginPage.test.tsx`: signed-in email, Continue → `/`, logout button calls `logout`.

### Task 2: Green + commit

`feat: let signed-in users switch accounts from the login page`

---

## Self-Review

Spec coverage: interstitial ✓, continue link ✓, logout clears to form ✓. Multi-session out of scope ✓.
