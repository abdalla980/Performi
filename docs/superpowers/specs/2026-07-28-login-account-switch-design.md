# Login Page — Switch Account Affordance — Design

## Context & Goal

`frontend/src/pages/LoginPage.tsx` currently does `if (session) return <Navigate to="/" replace />` — if you're already signed in as anyone, visiting `/login` bounces you straight back, with no way to reach the actual login form. Combined with `supabaseClient.ts` using a default `createClient()` (session in `localStorage`, shared across every tab of the same browser), this makes switching between an agency session and a client-portal session needlessly painful: you can't just open a new tab and log in as someone else, and you can't even get to the form to try.

Both `AppShell.tsx` and `ClientPortalShell.tsx` already have working "Log out" buttons — logging out and then visiting `/login` already works correctly today (session becomes `null`, the redirect condition is false, the form shows). The actual gap is narrow: there's no fast path from "I'm signed in as X, I want to sign in as Y" without first hunting for the logout button in whichever shell you're currently in.

## Target Design

Replace the silent redirect with a small interstitial when a session already exists:

```tsx
// frontend/src/pages/LoginPage.tsx
export function LoginPage() {
  const { session, login, logout } = useAuth()

  if (session) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          You're already signed in as <span className="font-medium text-foreground">{session.user.email}</span>.
        </p>
        <div className="flex gap-2">
          <Link to="/" className={buttonVariants()}>Continue</Link>
          <Button variant="outline" onClick={() => logout()}>Log out & use a different account</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <LoginForm onLogin={login} />
    </div>
  )
}
```

Clicking "Log out & use a different account" calls the existing `logout()` (already `supabase.auth.signOut()` under the hood, already clears `localStorage` and fires the auth-state-change listener) — `session` becomes `null`, the component re-renders past the `if (session)` branch, and the real login form appears in the same view, no extra navigation needed.

**Note this doesn't solve simultaneous dual-login** (agency + client open and active in two tabs at once) — that's still a genuinely separate browser-profile/incognito situation, unrelated to this fix, and not being solved here (see Explicitly Out of Scope). This spec fixes the specific trap: not being able to *reach* the form at all without already knowing to go find a logout button first.

## Impact Map

| File | Change |
|---|---|
| `frontend/src/pages/LoginPage.tsx` | Replace the redirect with the interstitial above |
| `frontend/src/pages/LoginPage.test.tsx` (create if it doesn't exist) | New test: renders the interstitial with the signed-in email when a session exists; "Continue" links to `/`; clicking "Log out & use a different account" calls `logout` |

## Testing

Per this repo's TDD convention. Check whether `LoginPage.test.tsx` already exists before assuming it needs creating from scratch.

## Explicitly Out of Scope

- True simultaneous multi-session support (e.g. namespacing Supabase's storage key per role so an agency tab and a client tab can both stay signed in at once in the same browser) — bigger change, real product-security surface to think through, not needed for what was actually reported. Advise separate browser profiles/incognito for that case instead.
- Any change to `supabaseClient.ts`'s session storage configuration.
