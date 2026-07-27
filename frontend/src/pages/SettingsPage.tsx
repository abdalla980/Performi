import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { useApiClient } from '../lib/apiClientContext'
import type { ConfigStatus } from '../lib/types'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

const INTEGRATIONS: Array<{ key: keyof ConfigStatus; label: string }> = [
  { key: 'anthropicConfigured', label: 'AI campaign generation' },
  { key: 'googleAdsConfigured', label: 'Google Ads' },
  { key: 'metaConfigured', label: 'Meta' },
]

const SOCIAL_LINKS = ['X (Twitter)', 'LinkedIn', 'Instagram']

export function SettingsPage() {
  const { session } = useAuth()
  const apiClient = useApiClient()
  const { data: configStatus } = useQuery({ queryKey: ['config-status'], queryFn: () => apiClient.getConfigStatus() })

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Your agency profile and connected integrations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agency profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium text-foreground">{session?.user.email ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>What's live vs. still running in demo mode.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {INTEGRATIONS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <span className="text-foreground">{label}</span>
              <Badge variant={configStatus?.[key] ? 'success' : 'default'}>
                {configStatus?.[key] ? 'Configured' : 'Demo mode'}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Follow Perform<span className="text-primary">i</span>
          </CardTitle>
          <CardDescription>Not live yet — placeholder for when these accounts exist.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SOCIAL_LINKS.map((label) => (
            <button
              key={label}
              type="button"
              disabled
              title={`${label} — coming soon`}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
