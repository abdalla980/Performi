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
