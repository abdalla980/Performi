# Retention Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four near-term retention features from `docs/superpowers/specs/2026-07-27-retention-features-design.md` — an in-app attention feed, an agency-wide impact-stats row, a recurring-rebrief shortcut, and a branded client summary page — so Performi has a reason to be reopened after a campaign launches.

**Architecture:** Every new backend endpoint is a read-only query over existing tables (`CampaignDraft`, `Approval`, `GuardrailReport`, `ClientAsset`, `BrandVoiceProfile`) — no new tables, no `dev.db` migration. Frontend follows the existing `Raw*` → `to*()` mapping pattern already used throughout `apiClient.http.ts`, and every new `ApiClient` method gets a matching `notImplemented` stub in `fakeApiClient.ts`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (backend), React + Vite + TanStack Query + react-router-dom (frontend), pytest + vitest for tests.

## Global Constraints

- TDD per this repo's convention: write the failing test, run it and confirm it fails for the right reason, write minimal implementation, run it and confirm it passes, commit. No task is done until its test(s) are green.
- Run the relevant full suite before committing each task: `cd backend && python -m pytest -q` for backend tasks, `cd frontend && npx vitest run && npx tsc -b` for frontend tasks.
- No `dev.db` migration in this plan — every backend task is additive/read-only against existing columns.
- Match existing code style exactly: snake_case Pydantic schemas in `backend/app/schemas/`, one router per resource registered in `backend/app/main.py`, camelCase TypeScript types with a `Raw*`/`to*()` conversion pair in `apiClient.http.ts`.
- Backend routes are agency-scoped via `Depends(get_current_agency)` and must filter every query by `Client.agency_id == agency.id` (join through `Brief`/`CampaignDraft` as needed) — never return another agency's data.

---

### Task 1: Backend — attention-feed endpoint (`GET /notifications`)

**Files:**
- Create: `backend/app/schemas/notifications.py`
- Create: `backend/app/routers/notifications.py`
- Modify: `backend/app/main.py` (register the router)
- Test: `backend/tests/test_notifications.py`

**Interfaces:**
- Produces: `GET /notifications` → `list[NotificationItem]`, each `{draft_id: UUID, client_name: str, kind: "pending_approval_stale"|"client_pending_stale"|"guardrail_blocked"|"launch_failed", days_stale: int}`, sorted by `days_stale` descending.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_notifications.py
from datetime import datetime, timedelta, timezone

from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from tests.conftest import make_supabase_jwt


def _agency_and_client(db_session):
    agency = Agency(supabase_user_id="sb-notif-1", name="Acme", email="notif@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    return client_row, headers


def test_flags_stale_pending_agency_approval(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, status="guardrail_checked")
    db_session.add(draft)
    db_session.commit()
    draft.updated_at = datetime.now(timezone.utc) - timedelta(days=4)
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["kind"] == "pending_approval_stale"
    assert body[0]["client_name"] == "Client A"
    assert body[0]["days_stale"] >= 4

    main.app.dependency_overrides.clear()


def test_flags_blocked_guardrail_regardless_of_staleness(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, status="guardrail_checked")
    db_session.add(draft)
    db_session.flush()
    db_session.add(
        GuardrailReport(
            campaign_draft_id=draft.id,
            flags_json=[{"severity": "block", "code": "x", "message": "bad"}],
            has_blocking_flags=True,
        )
    )
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["kind"] == "guardrail_blocked"

    main.app.dependency_overrides.clear()


def test_excludes_fresh_drafts(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief.id, status="guardrail_checked"))
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    assert response.json() == []

    main.app.dependency_overrides.clear()


def test_scopes_to_the_requesting_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_and_client(db_session)

    other_agency = Agency(supabase_user_id="sb-notif-2", name="Other", email="other@acme.test")
    db_session.add(other_agency)
    db_session.flush()
    other_client = Client(agency_id=other_agency.id, name="Other Client")
    db_session.add(other_client)
    db_session.flush()
    other_brief = Brief(client_id=other_client.id, business_description="X", budget_usd=100, goals="Y")
    db_session.add(other_brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=other_brief.id, status="failed"))
    db_session.commit()

    response = client.get("/notifications", headers=headers)

    assert response.status_code == 200
    assert response.json() == []

    main.app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_notifications.py -v`
Expected: FAIL — `404 Not Found` (no `/notifications` route registered yet).

- [ ] **Step 3: Write the schema**

```python
# backend/app/schemas/notifications.py
import uuid
from typing import Literal

from pydantic import BaseModel

NotificationKind = Literal[
    "pending_approval_stale", "client_pending_stale", "guardrail_blocked", "launch_failed"
]


class NotificationItem(BaseModel):
    draft_id: uuid.UUID
    client_name: str
    kind: NotificationKind
    days_stale: int
```

- [ ] **Step 4: Write the router**

```python
# backend/app/routers/notifications.py
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.schemas.notifications import NotificationItem
from app.security import get_current_agency

router = APIRouter(prefix="/notifications", tags=["notifications"])

_PENDING_APPROVAL_STALE_DAYS = 3
_CLIENT_PENDING_STALE_DAYS = 5


def _days_since(dt: datetime) -> int:
    reference = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - reference).days


@router.get("", response_model=list[NotificationItem])
def list_notifications(
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> list[NotificationItem]:
    query = (
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id)
    )
    drafts = db.scalars(query).all()

    items: list[NotificationItem] = []
    for draft in drafts:
        client_name = draft.brief.client.name
        days_stale = _days_since(draft.updated_at)

        if draft.status == "failed":
            items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="launch_failed", days_stale=days_stale))
            continue

        if draft.status == "guardrail_checked":
            report = db.scalar(select(GuardrailReport).where(GuardrailReport.campaign_draft_id == draft.id))
            if report is not None and report.has_blocking_flags:
                items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="guardrail_blocked", days_stale=days_stale))
                continue
            if days_stale >= _PENDING_APPROVAL_STALE_DAYS:
                items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="pending_approval_stale", days_stale=days_stale))
            continue

        if draft.status == "approved" and days_stale >= _CLIENT_PENDING_STALE_DAYS:
            items.append(NotificationItem(draft_id=draft.id, client_name=client_name, kind="client_pending_stale", days_stale=days_stale))

    items.sort(key=lambda item: item.days_stale, reverse=True)
    return items
```

- [ ] **Step 5: Register the router**

In `backend/app/main.py`, add `notifications,` to the `from app.routers import (...)` block, alphabetically between `me,` and `whoami,`, and add `app.include_router(notifications.router)` next to the other `include_router` calls.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_notifications.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Run full backend suite and commit**

```bash
cd backend && python -m pytest -q
git add app/schemas/notifications.py app/routers/notifications.py app/main.py tests/test_notifications.py
git commit -m "feat: add GET /notifications attention-feed endpoint"
```

---

### Task 2: Frontend — notifications bell in the top nav

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `NotificationKind`, `Notification`, `listNotifications` on `ApiClient`)
- Modify: `frontend/src/lib/apiClient.http.ts` (add `RawNotification`, `toNotification`, `listNotifications`)
- Modify: `frontend/src/test/fakeApiClient.ts` (add `listNotifications` stub)
- Create: `frontend/src/components/NotificationsMenu.tsx`
- Modify: `frontend/src/components/AppShell.tsx` (mount it)
- Test: `frontend/src/components/NotificationsMenu.test.tsx`

**Interfaces:**
- Consumes: `apiClient.listNotifications(): Promise<Notification[]>` (defined this task)
- Produces: `NotificationsMenu` component, no props, reads `useApiClient()` itself.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/NotificationsMenu.test.tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationsMenu } from './NotificationsMenu'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { Notification } from '../lib/types'

const ITEMS: Notification[] = [
  { draftId: 'draft-1', clientName: 'Acme Bakery', kind: 'pending_approval_stale', daysStale: 4 },
]

describe('NotificationsMenu', () => {
  it('shows a count badge and lists stale drafts on click', async () => {
    const apiClient = createFakeApiClient({ listNotifications: async () => ITEMS })
    renderWithProviders(<NotificationsMenu />, { apiClient })

    expect(await screen.findByText('1')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Notifications'))

    expect(screen.getByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText(/Awaiting your review/)).toBeInTheDocument()
  })

  it('shows an empty state when nothing needs attention', async () => {
    const apiClient = createFakeApiClient({ listNotifications: async () => [] })
    renderWithProviders(<NotificationsMenu />, { apiClient })

    await userEvent.click(await screen.findByLabelText('Notifications'))

    expect(screen.getByText('Nothing needs your attention.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/NotificationsMenu.test.tsx`
Expected: FAIL — cannot find module `./NotificationsMenu`.

- [ ] **Step 3: Add the type, API client method, and fake stub**

In `frontend/src/lib/types.ts`, add near the other domain types:

```ts
export type NotificationKind = 'pending_approval_stale' | 'client_pending_stale' | 'guardrail_blocked' | 'launch_failed'

export interface Notification {
  draftId: string
  clientName: string
  kind: NotificationKind
  daysStale: number
}
```

Add to the `ApiClient` interface: `listNotifications(): Promise<Notification[]>`

In `frontend/src/lib/apiClient.http.ts`, add the `Notification` import to the existing `import type { ... } from './types'` block, then add:

```ts
interface RawNotification {
  draft_id: string
  client_name: string
  kind: Notification['kind']
  days_stale: number
}

function toNotification(raw: RawNotification): Notification {
  return { draftId: raw.draft_id, clientName: raw.client_name, kind: raw.kind, daysStale: raw.days_stale }
}
```

and inside the returned object of `createHttpApiClient`, add:

```ts
    async listNotifications(): Promise<Notification[]> {
      const raw = await get<RawNotification[]>('/notifications')
      return raw.map(toNotification)
    },
```

In `frontend/src/test/fakeApiClient.ts`, add `listNotifications: notImplemented('listNotifications'),` to the returned object.

- [ ] **Step 4: Write the component**

```tsx
// frontend/src/components/NotificationsMenu.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import type { NotificationKind } from '../lib/types'

const KIND_LABEL: Record<NotificationKind, string> = {
  pending_approval_stale: 'Awaiting your review',
  client_pending_stale: "Awaiting the client's review",
  guardrail_blocked: 'Blocked by a guardrail flag',
  launch_failed: 'Failed to launch',
}

export function NotificationsMenu() {
  const apiClient = useApiClient()
  const [open, setOpen] = useState(false)
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiClient.listNotifications(),
    refetchInterval: 60_000,
  })
  const count = notifications?.length ?? 0

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
      >
        <Bell className="h-4.5 w-4.5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-border bg-card shadow-lg">
          {count === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nothing needs your attention.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {notifications!.map((item) => (
                <li key={`${item.draftId}-${item.kind}`}>
                  <Link
                    to={`/campaigns/${item.draftId}`}
                    onClick={() => setOpen(false)}
                    className="flex flex-col gap-0.5 px-4 py-2.5 text-sm hover:bg-primary-soft"
                  >
                    <span className="font-medium text-foreground">{item.clientName}</span>
                    <span className="text-xs text-muted-foreground">
                      {KIND_LABEL[item.kind]} · {item.daysStale}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/NotificationsMenu.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Mount it in AppShell**

In `frontend/src/components/AppShell.tsx`, add the import `import { NotificationsMenu } from './NotificationsMenu'`, then wrap the existing `{demoModeActive && (...)}` block and the `<main>` with a new header row so the bell shows on every agency page:

```tsx
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end border-b border-border px-6 py-3">
          <NotificationsMenu />
        </div>
        {demoModeActive && (
```

(leave the rest of the file — the `demoModeActive` block and `<main>` — unchanged, just inserted the new header `div` immediately before it inside the same parent `div`.)

- [ ] **Step 7: Run full frontend suite and typecheck, then commit**

```bash
cd frontend && npx vitest run && npx tsc -b
git add src/lib/types.ts src/lib/apiClient.http.ts src/test/fakeApiClient.ts src/components/NotificationsMenu.tsx src/components/NotificationsMenu.test.tsx src/components/AppShell.tsx
git commit -m "feat: add notifications bell for stale/blocked drafts"
```

---

### Task 3: Backend — impact-stats endpoint (`GET /stats/impact`)

**Files:**
- Create: `backend/app/schemas/stats.py`
- Create: `backend/app/routers/stats.py`
- Modify: `backend/app/main.py` (register the router)
- Test: `backend/tests/test_stats.py`

**Interfaces:**
- Produces: `GET /stats/impact` → `ImpactStatsResponse {campaigns_launched: int, estimated_hours_saved: float, guardrail_issues_caught: int}`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_stats.py
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from tests.conftest import make_supabase_jwt


def _agency_and_client(db_session):
    agency = Agency(supabase_user_id="sb-stats-1", name="Acme", email="stats@acme.test")
    db_session.add(agency)
    db_session.flush()
    client_row = Client(agency_id=agency.id, name="Client A")
    db_session.add(client_row)
    db_session.commit()
    headers = {"Authorization": f"Bearer {make_supabase_jwt(agency.supabase_user_id)}"}
    return client_row, headers


def test_computes_launched_count_and_hours_saved(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief.id, status="launched"))
    brief2 = Brief(client_id=client_row.id, business_description="Bakery 2", budget_usd=500, goals="Traffic")
    db_session.add(brief2)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=brief2.id, status="adapted"))  # not launched — excluded
    db_session.commit()

    response = client.get("/stats/impact", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["campaigns_launched"] == 1
    assert body["estimated_hours_saved"] == 2.0

    main.app.dependency_overrides.clear()


def test_sums_guardrail_issues_across_all_drafts(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    client_row, headers = _agency_and_client(db_session)

    brief = Brief(client_id=client_row.id, business_description="Bakery", budget_usd=500, goals="Traffic")
    db_session.add(brief)
    db_session.flush()
    draft = CampaignDraft(brief_id=brief.id, status="guardrail_checked")
    db_session.add(draft)
    db_session.flush()
    db_session.add(
        GuardrailReport(
            campaign_draft_id=draft.id,
            flags_json=[{"severity": "warn", "code": "a", "message": "m1"}, {"severity": "block", "code": "b", "message": "m2"}],
            has_blocking_flags=True,
        )
    )
    db_session.commit()

    response = client.get("/stats/impact", headers=headers)

    assert response.status_code == 200
    assert response.json()["guardrail_issues_caught"] == 2

    main.app.dependency_overrides.clear()


def test_scopes_to_the_requesting_agency(client, db_session):
    from app import main

    main.app.dependency_overrides[main.get_db] = lambda: db_session
    _, headers = _agency_and_client(db_session)

    other_agency = Agency(supabase_user_id="sb-stats-2", name="Other", email="other@acme.test")
    db_session.add(other_agency)
    db_session.flush()
    other_client = Client(agency_id=other_agency.id, name="Other Client")
    db_session.add(other_client)
    db_session.flush()
    other_brief = Brief(client_id=other_client.id, business_description="X", budget_usd=100, goals="Y")
    db_session.add(other_brief)
    db_session.flush()
    db_session.add(CampaignDraft(brief_id=other_brief.id, status="launched"))
    db_session.commit()

    response = client.get("/stats/impact", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["campaigns_launched"] == 0
    assert body["guardrail_issues_caught"] == 0

    main.app.dependency_overrides.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_stats.py -v`
Expected: FAIL — `404 Not Found` (no `/stats/impact` route registered yet).

- [ ] **Step 3: Write the schema**

```python
# backend/app/schemas/stats.py
from pydantic import BaseModel


class ImpactStatsResponse(BaseModel):
    campaigns_launched: int
    estimated_hours_saved: float
    guardrail_issues_caught: int
```

- [ ] **Step 4: Write the router**

```python
# backend/app/routers/stats.py
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.agency import Agency
from app.models.brief import Brief, CampaignDraft
from app.models.client import Client
from app.models.guardrail import GuardrailReport
from app.schemas.stats import ImpactStatsResponse
from app.security import get_current_agency

router = APIRouter(prefix="/stats", tags=["stats"])

_HOURS_SAVED_PER_CAMPAIGN = 2.0


@router.get("/impact", response_model=ImpactStatsResponse)
def get_impact_stats(
    db: Session = Depends(get_db),
    agency: Agency = Depends(get_current_agency),
) -> ImpactStatsResponse:
    launched_query = (
        select(CampaignDraft)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id, CampaignDraft.status == "launched")
    )
    campaigns_launched = len(db.scalars(launched_query).all())

    reports_query = (
        select(GuardrailReport)
        .join(CampaignDraft, GuardrailReport.campaign_draft_id == CampaignDraft.id)
        .join(Brief, CampaignDraft.brief_id == Brief.id)
        .join(Client, Brief.client_id == Client.id)
        .where(Client.agency_id == agency.id)
    )
    guardrail_issues_caught = sum(len(report.flags_json) for report in db.scalars(reports_query).all())

    return ImpactStatsResponse(
        campaigns_launched=campaigns_launched,
        estimated_hours_saved=campaigns_launched * _HOURS_SAVED_PER_CAMPAIGN,
        guardrail_issues_caught=guardrail_issues_caught,
    )
```

- [ ] **Step 5: Register the router**

In `backend/app/main.py`, add `stats,` to the `from app.routers import (...)` block, alphabetically between `notifications,` (added in Task 1) and `whoami,`, and add `app.include_router(stats.router)`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_stats.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Run full backend suite and commit**

```bash
cd backend && python -m pytest -q
git add app/schemas/stats.py app/routers/stats.py app/main.py tests/test_stats.py
git commit -m "feat: add GET /stats/impact endpoint"
```

---

### Task 4: Frontend — impact stats row on CampaignsPage

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `ImpactStats`, `getImpactStats` on `ApiClient`)
- Modify: `frontend/src/lib/apiClient.http.ts` (add `RawImpactStats`, `toImpactStats`, `getImpactStats`)
- Modify: `frontend/src/test/fakeApiClient.ts` (add `getImpactStats` stub)
- Modify: `frontend/src/pages/CampaignsPage.tsx` (render the stat row)
- Test: `frontend/src/pages/CampaignsPage.test.tsx` (extend)

**Interfaces:**
- Consumes: `apiClient.getImpactStats(): Promise<ImpactStats>` (defined this task)

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/pages/CampaignsPage.test.tsx`, inside the `describe('CampaignsPage', ...)` block:

```tsx
  it('shows the impact stat row once campaigns have launched', async () => {
    const apiClient = createFakeApiClient({
      listBriefs: async () => DRAFTS,
      listClients: async () => ONE_CLIENT,
      getImpactStats: async () => ({ campaignsLaunched: 3, estimatedHoursSaved: 6, guardrailIssuesCaught: 5 }),
    })
    renderWithProviders(<CampaignsPage />, { apiClient })

    const impact = await screen.findByRole('region', { name: /impact/i })
    expect(within(impact).getByText('6')).toBeInTheDocument()
    expect(within(impact).getByText('5')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/CampaignsPage.test.tsx`
Expected: FAIL — no element with role `region` named `/impact/i`, and `getImpactStats` isn't called by the page yet.

- [ ] **Step 3: Add the type, API client method, and fake stub**

In `frontend/src/lib/types.ts`, add:

```ts
export interface ImpactStats {
  campaignsLaunched: number
  estimatedHoursSaved: number
  guardrailIssuesCaught: number
}
```

Add to the `ApiClient` interface: `getImpactStats(): Promise<ImpactStats>`

In `frontend/src/lib/apiClient.http.ts`, add `ImpactStats` to the `import type { ... } from './types'` block, then:

```ts
interface RawImpactStats {
  campaigns_launched: number
  estimated_hours_saved: number
  guardrail_issues_caught: number
}

function toImpactStats(raw: RawImpactStats): ImpactStats {
  return {
    campaignsLaunched: raw.campaigns_launched,
    estimatedHoursSaved: raw.estimated_hours_saved,
    guardrailIssuesCaught: raw.guardrail_issues_caught,
  }
}
```

and inside `createHttpApiClient`'s returned object:

```ts
    async getImpactStats(): Promise<ImpactStats> {
      return toImpactStats(await get<RawImpactStats>('/stats/impact'))
    },
```

In `frontend/src/test/fakeApiClient.ts`, add `getImpactStats: notImplemented('getImpactStats'),`.

- [ ] **Step 4: Render the stat row in CampaignsPage**

In `frontend/src/pages/CampaignsPage.tsx`, add `ShieldCheck, TrendingUp` to the `lucide-react` import line, add a query after the existing `clients` query:

```tsx
  const { data: impactStats } = useQuery({ queryKey: ['impact-stats'], queryFn: () => apiClient.getImpactStats() })
```

and render a second stat region right after the existing `{!hasNoClients && !hasNoDraftsYet && (...)}` summary-stats block:

```tsx
      {impactStats && impactStats.campaignsLaunched > 0 && (
        <div role="region" aria-label="Impact" className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <StatTile icon={TrendingUp} label="Est. hours saved" value={impactStats.estimatedHoursSaved.toFixed(0)} />
          <StatTile icon={ShieldCheck} label="Guardrail issues caught" value={impactStats.guardrailIssuesCaught} />
        </div>
      )}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/CampaignsPage.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 6: Run full frontend suite and typecheck, then commit**

```bash
cd frontend && npx vitest run && npx tsc -b
git add src/lib/types.ts src/lib/apiClient.http.ts src/test/fakeApiClient.ts src/pages/CampaignsPage.tsx src/pages/CampaignsPage.test.tsx
git commit -m "feat: show cumulative impact stats on the campaigns page"
```

---

### Task 5: Frontend — recurring rebrief CTA

**Files:**
- Modify: `frontend/src/pages/CampaignsPage.tsx` (surface "Refresh campaign" for stale launched clients)
- Modify: `frontend/src/pages/NewBriefPage.tsx` (prefill from `?duplicateFrom=<draftId>`)
- Test: `frontend/src/pages/CampaignsPage.test.tsx` (extend)
- Test: `frontend/src/pages/NewBriefPage.test.tsx` (extend)

**Interfaces:**
- Consumes: existing `apiClient.listBriefs()` (CampaignsPage) and `apiClient.getBrief(draftId)` (NewBriefPage) — no new API surface.

- [ ] **Step 1: Write the failing test for the CampaignsPage CTA**

Append to `frontend/src/pages/CampaignsPage.test.tsx`:

```tsx
  it('offers to refresh a client whose only launch is over 30 days old', async () => {
    const staleDraft: DraftSummary = { ...DRAFTS[1], id: 'draft-stale', status: 'launched', createdAt: '2026-01-01T00:00:00Z' }
    const apiClient = createFakeApiClient({ listBriefs: async () => [staleDraft], listClients: async () => ONE_CLIENT })
    renderWithProviders(<CampaignsPage />, { apiClient })

    const link = await screen.findByRole('link', { name: /refresh campaign/i })
    expect(link).toHaveAttribute('href', '/campaigns/new?duplicateFrom=draft-stale')
  })

  it('does not offer a refresh for a recently launched client', async () => {
    const apiClient = createFakeApiClient({ listBriefs: async () => DRAFTS, listClients: async () => ONE_CLIENT })
    renderWithProviders(<CampaignsPage />, { apiClient })

    await screen.findByText('Acme Plumbing')
    expect(screen.queryByRole('link', { name: /refresh campaign/i })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/CampaignsPage.test.tsx`
Expected: FAIL — no link named `/refresh campaign/i`.

- [ ] **Step 3: Implement the CTA in CampaignsPage**

In `frontend/src/pages/CampaignsPage.tsx`, add a `useMemo` after the existing `stats` memo:

```tsx
  const REBRIEF_ELIGIBLE_DAYS = 30

  const rebriefCandidates = useMemo(() => {
    if (!drafts) return []
    const latestByClient = new Map<string, (typeof drafts)[number]>()
    for (const draft of drafts) {
      const current = latestByClient.get(draft.clientId)
      if (!current || new Date(draft.createdAt) > new Date(current.createdAt)) {
        latestByClient.set(draft.clientId, draft)
      }
    }
    const cutoff = Date.now() - REBRIEF_ELIGIBLE_DAYS * 24 * 60 * 60 * 1000
    return [...latestByClient.values()].filter(
      (draft) => draft.status === 'launched' && new Date(draft.createdAt).getTime() < cutoff,
    )
  }, [drafts])
```

and render it right after the impact-stats block added in Task 4:

```tsx
      {rebriefCandidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Ready for a refresh</p>
          <div className="flex flex-col gap-1.5">
            {rebriefCandidates.map((draft) => (
              <div key={draft.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {draft.clientName} — launched {new Date(draft.createdAt).toLocaleDateString()}
                </span>
                <Link to={`/campaigns/new?duplicateFrom=${draft.id}`} className="font-medium text-primary hover:underline">
                  Refresh campaign
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/CampaignsPage.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Write the failing test for NewBriefPage prefill**

Append to `frontend/src/pages/NewBriefPage.test.tsx` (add `DraftDetail` to the existing `import type { ... } from '../lib/types'` line):

```tsx
  it('prefills a client row from an existing draft when duplicating for a refresh', async () => {
    const source: DraftDetail = {
      id: 'draft-1',
      briefId: 'brief-1',
      clientId: 'client-1',
      clientName: 'Acme Bakery',
      clientLogoUrl: null,
      platforms: ['google'],
      status: 'launched',
      businessDescription: 'Local bakery',
      budgetUsd: 500,
      goals: 'Drive traffic',
      guardrailFlagCount: 0,
      hasBlockingFlags: false,
      createdAt: '2026-05-01T00:00:00Z',
      websiteUrl: 'https://acme.test',
      targetLocation: 'Austin, TX',
      targetAudience: 'Homeowners',
      endDate: '2026-06-01',
      competitors: 'Big Bakery Co',
      uniqueSellingPoints: 'Fresh daily',
      excludedKeywords: ['free'],
      googlePlan: null,
      metaPlan: null,
      guardrail: null,
      launches: [],
      projectedMetrics: null,
    }
    const apiClient = createFakeApiClient({ listClients: async () => CLIENTS, getBrief: async () => source })

    renderWithProviders(<NewBriefPage />, {
      apiClient,
      path: '/campaigns/new',
      initialEntries: ['/campaigns/new?duplicateFrom=draft-1'],
    })

    expect(await screen.findByDisplayValue('Local bakery')).toBeInTheDocument()
    expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Austin, TX')).toBeInTheDocument()
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/NewBriefPage.test.tsx`
Expected: FAIL — the client row never renders because nothing pre-selects it.

- [ ] **Step 7: Implement the prefill in NewBriefPage**

In `frontend/src/pages/NewBriefPage.tsx`, change the imports:

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
```

Inside `NewBriefPage`, after `const navigate = useNavigate()`, add:

```tsx
  const [searchParams] = useSearchParams()
  const duplicateFromDraftId = searchParams.get('duplicateFrom')
```

After the existing `clients` query, add:

```tsx
  const { data: duplicateSource } = useQuery({
    queryKey: ['briefs', duplicateFromDraftId],
    queryFn: () => apiClient.getBrief(duplicateFromDraftId!),
    enabled: Boolean(duplicateFromDraftId),
  })

  useEffect(() => {
    if (!duplicateSource) return
    setRows((prev) => ({
      ...prev,
      [duplicateSource.clientId]: {
        businessDescription: duplicateSource.businessDescription,
        budgetUsd: String(duplicateSource.budgetUsd),
        goals: duplicateSource.goals,
        websiteUrl: duplicateSource.websiteUrl ?? '',
        targetLocation: duplicateSource.targetLocation ?? '',
        targetAudience: duplicateSource.targetAudience ?? '',
        // Deliberately not copied — a 30-day-old campaign's end date has likely
        // already passed, and silently reusing it would submit an already-expired plan.
        endDate: '',
        platformGoogle: duplicateSource.platforms.includes('google'),
        platformMeta: duplicateSource.platforms.includes('meta'),
        competitors: duplicateSource.competitors ?? '',
        uniqueSellingPoints: duplicateSource.uniqueSellingPoints ?? '',
        excludedKeywords: duplicateSource.excludedKeywords.join(', '),
      },
    }))
  }, [duplicateSource])
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/NewBriefPage.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 9: Run full frontend suite and typecheck, then commit**

```bash
cd frontend && npx vitest run && npx tsc -b
git add src/pages/CampaignsPage.tsx src/pages/CampaignsPage.test.tsx src/pages/NewBriefPage.tsx src/pages/NewBriefPage.test.tsx
git commit -m "feat: add recurring rebrief shortcut for stale launched clients"
```

---

### Task 6: Frontend — branded client summary page

**Files:**
- Create: `frontend/src/pages/ClientSummaryPage.tsx`
- Modify: `frontend/src/AppRoutes.tsx` (add the route, agency-only, outside `AppShell`)
- Modify: `frontend/src/pages/DraftDetailPage.tsx` (add "Share summary" link)
- Test: `frontend/src/pages/ClientSummaryPage.test.tsx`
- Test: `frontend/src/pages/DraftDetailPage.test.tsx` (extend)

**Interfaces:**
- Consumes: existing `apiClient.getBrief(draftId)` and `apiClient.getClient(clientId)` — no new API surface.

- [ ] **Step 1: Write the failing test for ClientSummaryPage**

```tsx
// frontend/src/pages/ClientSummaryPage.test.tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClientSummaryPage } from './ClientSummaryPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { ClientDetail, DraftDetail } from '../lib/types'

const DRAFT: DraftDetail = {
  id: 'draft-1',
  briefId: 'brief-1',
  clientId: 'client-1',
  clientName: 'Acme Bakery',
  clientLogoUrl: null,
  platforms: ['google'],
  status: 'launched',
  businessDescription: 'Local bakery in Austin',
  budgetUsd: 500,
  goals: 'Drive traffic',
  guardrailFlagCount: 0,
  hasBlockingFlags: false,
  createdAt: '2026-07-01T00:00:00Z',
  websiteUrl: 'https://acme.test',
  targetLocation: 'Austin, TX',
  targetAudience: 'Homeowners',
  endDate: null,
  competitors: 'Big Bakery Co',
  uniqueSellingPoints: 'Fresh daily',
  excludedKeywords: ['free'],
  googlePlan: {
    campaignName: 'Bakery Campaign',
    dailyBudgetMicros: 16_000_000,
    endDate: null,
    finalUrl: 'https://acme.test',
    negativeKeywords: [],
    adGroups: [],
  },
  metaPlan: null,
  guardrail: null,
  launches: [],
  projectedMetrics: null,
}

const CLIENT: ClientDetail = {
  id: 'client-1',
  name: 'Acme Bakery',
  googleAdsCustomerId: null,
  metaAdAccountId: null,
  googleConnected: false,
  metaConnected: false,
  logoUrl: null,
  brandVoice: { id: 'bv-1', clientId: 'client-1', tone: 'warm and friendly', bannedTerms: [], requiredDisclaimers: [], approvedOffers: [] },
  assets: [],
}

describe('ClientSummaryPage', () => {
  it('renders a client-facing summary without internal-only fields', async () => {
    const apiClient = createFakeApiClient({ getBrief: async () => DRAFT, getClient: async () => CLIENT })
    renderWithProviders(<ClientSummaryPage />, {
      apiClient,
      path: '/campaigns/:draftId/summary',
      initialEntries: ['/campaigns/draft-1/summary'],
    })

    expect(await screen.findByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText('Bakery Campaign')).toBeInTheDocument()
    expect(screen.getByText(/warm and friendly/)).toBeInTheDocument()
    expect(screen.queryByText('Big Bakery Co')).not.toBeInTheDocument()
    expect(screen.queryByText('Fresh daily')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/ClientSummaryPage.test.tsx`
Expected: FAIL — cannot find module `./ClientSummaryPage`.

- [ ] **Step 3: Write the page**

```tsx
// frontend/src/pages/ClientSummaryPage.tsx
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import { GooglePlanView, MetaPlanView } from '../components/CampaignPlanViews'
import { Alert } from '../components/ui/alert'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export function ClientSummaryPage() {
  const { draftId = '' } = useParams<{ draftId: string }>()
  const apiClient = useApiClient()

  const {
    data: draft,
    isPending: isDraftPending,
    isError: isDraftError,
  } = useQuery({
    queryKey: ['briefs', draftId],
    queryFn: () => apiClient.getBrief(draftId),
    enabled: Boolean(draftId),
  })
  const { data: client } = useQuery({
    queryKey: ['clients', draft?.clientId],
    queryFn: () => apiClient.getClient(draft!.clientId),
    enabled: Boolean(draft?.clientId),
  })

  if (isDraftPending) {
    return <p className="p-8 text-sm text-muted-foreground">Loading summary…</p>
  }
  if (isDraftError || !draft) {
    return <Alert className="m-8">Couldn't load this campaign.</Alert>
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8 print:p-0">
      <div className="flex items-center gap-3">
        {draft.clientLogoUrl && (
          <img
            src={`${API_BASE_URL}${draft.clientLogoUrl}`}
            alt={`${draft.clientName} logo`}
            className="h-12 w-12 rounded-md object-cover"
          />
        )}
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{draft.clientName}</h1>
          <p className="text-sm text-muted-foreground">{draft.businessDescription}</p>
        </div>
      </div>

      {client?.brandVoice?.tone && (
        <p className="text-sm italic text-muted-foreground">Brand voice: {client.brandVoice.tone}</p>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Monthly budget</p>
          <p className="font-medium text-foreground">${draft.budgetUsd.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Platforms</p>
          <p className="font-medium text-foreground">
            {draft.platforms.map((p) => (p === 'google' ? 'Google Ads' : 'Meta')).join(', ')}
          </p>
        </div>
        {draft.targetLocation && (
          <div>
            <p className="text-muted-foreground">Target location</p>
            <p className="font-medium text-foreground">{draft.targetLocation}</p>
          </div>
        )}
      </div>

      {draft.googlePlan && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Google Ads</h2>
          <GooglePlanView plan={draft.googlePlan} />
        </div>
      )}
      {draft.metaPlan && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Meta</h2>
          <MetaPlanView plan={draft.metaPlan} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/ClientSummaryPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the route**

In `frontend/src/AppRoutes.tsx`, add the import `import { ClientSummaryPage } from './pages/ClientSummaryPage'`, then add a new route inside the agency `RequireRole` block but as a sibling to the `AppShell` route (not nested in it, so it renders full-page without the sidebar):

```tsx
      <Route element={<RequireRole role="agency" />}>
        <Route path="campaigns/:draftId/summary" element={<ClientSummaryPage />} />
        <Route element={<AppShell />}>
```

(the existing `<Route element={<AppShell />}>...</Route>` block stays exactly as-is, just add the new sibling route line above it.)

- [ ] **Step 6: Write the failing test for the DraftDetailPage button**

The file already has a `baseDraft(overrides: Partial<DraftDetail> = {})` factory (defined at the top of `frontend/src/pages/DraftDetailPage.test.tsx`) — reuse it rather than adding a second fixture. Append inside the existing `describe('DraftDetailPage', ...)` block:

```tsx
  it('shows a share-summary link once the campaign is client-approved or later', async () => {
    const draft = baseDraft({ status: 'launched' })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })
    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    const link = await screen.findByRole('link', { name: /share summary/i })
    expect(link).toHaveAttribute('href', '/campaigns/draft-1/summary')
  })

  it('hides the share-summary link before the client has approved', async () => {
    const draft = baseDraft({ status: 'adapted' })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })
    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')
    expect(screen.queryByRole('link', { name: /share summary/i })).not.toBeInTheDocument()
  })
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/DraftDetailPage.test.tsx`
Expected: FAIL — no link named `/share summary/i`.

- [ ] **Step 8: Implement the button**

In `frontend/src/pages/DraftDetailPage.tsx`, add `Share2` to the `lucide-react` import, add `cn` from `'../lib/utils'`, and add `buttonVariants` to the existing `import { Button } from '../components/ui/button'` line (making it `import { Button, buttonVariants } from '../components/ui/button'`). Change the header block:

```tsx
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{draft.clientName}</h1>
          <p className="text-sm text-muted-foreground">{draft.businessDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          {['client_approved', 'launched', 'failed'].includes(draft.status) && (
            <a
              href={`/campaigns/${draftId}/summary`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}
            >
              <Share2 className="h-4 w-4" />
              Share summary
            </a>
          )}
          <Badge variant={STATUS_BADGE_VARIANT[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
        </div>
      </div>
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/DraftDetailPage.test.tsx`
Expected: PASS

- [ ] **Step 10: Run full frontend suite and typecheck, then commit**

```bash
cd frontend && npx vitest run && npx tsc -b
git add src/pages/ClientSummaryPage.tsx src/pages/ClientSummaryPage.test.tsx src/AppRoutes.tsx src/pages/DraftDetailPage.tsx src/pages/DraftDetailPage.test.tsx
git commit -m "feat: add branded client-facing campaign summary page"
```
