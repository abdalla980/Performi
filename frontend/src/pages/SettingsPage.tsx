import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../lib/authContext'
import { useApiClient } from '../lib/apiClientContext'
import type { ConfigStatus } from '../lib/types'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const INTEGRATIONS: Array<{ key: keyof ConfigStatus; label: string }> = [
  { key: 'anthropicConfigured', label: 'AI campaign generation' },
  { key: 'googleAdsConfigured', label: 'Google Ads Manager Account' },
  { key: 'metaConfigured', label: 'Meta Business Manager' },
]

const SOCIAL_LINKS = ['X (Twitter)', 'LinkedIn', 'Instagram']

export function SettingsPage() {
  const { session } = useAuth()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const { data: configStatus } = useQuery({ queryKey: ['config-status'], queryFn: () => apiClient.getConfigStatus() })

  const [loginCustomerId, setLoginCustomerId] = useState('')
  const [metaBusinessId, setMetaBusinessId] = useState('')

  const connectGoogleMutation = useMutation({
    mutationFn: () => apiClient.getAgencyGoogleOAuthUrl(),
    onSuccess: (authorizeUrl) => window.location.assign(authorizeUrl),
  })
  const connectMetaMutation = useMutation({
    mutationFn: () => apiClient.getAgencyMetaOAuthUrl(),
    onSuccess: (authorizeUrl) => window.location.assign(authorizeUrl),
  })
  const setManagerMutation = useMutation({
    mutationFn: () => apiClient.setGoogleManagerAccount(loginCustomerId.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config-status'] })
    },
  })
  const setMetaBusinessMutation = useMutation({
    mutationFn: () => apiClient.setMetaBusinessAccount(metaBusinessId.trim()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['config-status'] })
    },
  })

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Settings</h1>
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
          <CardTitle className="text-base">Ad platform connections</CardTitle>
          <CardDescription>
            Connect once with your manager credentials. Then link each client by pasting their Customer ID / Ad Account
            ID on the client page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Google Ads Manager Account</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Connect using the Google account that manages your Google Ads Manager Account (MCC).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => connectGoogleMutation.mutate()}
                disabled={connectGoogleMutation.isPending}
              >
                {connectGoogleMutation.isPending ? 'Redirecting…' : 'Connect Google Ads Manager Account'}
              </Button>
              {configStatus?.googleAdsConfigured ? <Badge variant="success">Connected</Badge> : null}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="login-customer-id">Manager Customer ID (MCC)</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="login-customer-id"
                  placeholder="4574433227"
                  value={loginCustomerId}
                  onChange={(event) => setLoginCustomerId(event.target.value)}
                  className="h-9 w-44"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setManagerMutation.mutate()}
                  disabled={setManagerMutation.isPending || !loginCustomerId.trim()}
                >
                  {setManagerMutation.isPending ? 'Saving…' : 'Save manager ID'}
                </Button>
              </div>
              {setManagerMutation.isError && (
                <Alert>
                  {setManagerMutation.error instanceof Error
                    ? setManagerMutation.error.message
                    : 'Failed to save manager account ID.'}
                </Alert>
              )}
              {setManagerMutation.isSuccess && <Alert variant="success">Manager Customer ID saved.</Alert>}
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">Meta Business Manager</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Connect with a Business Manager admin account that already has partner access to client ad accounts.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => connectMetaMutation.mutate()} disabled={connectMetaMutation.isPending}>
                {connectMetaMutation.isPending ? 'Redirecting…' : 'Connect Meta Business Manager'}
              </Button>
              {configStatus?.metaConfigured ? <Badge variant="success">Connected</Badge> : null}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <Label htmlFor="meta-business-id">Business Manager ID</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="meta-business-id"
                  placeholder="1234567890"
                  value={metaBusinessId}
                  onChange={(event) => setMetaBusinessId(event.target.value)}
                  className="h-9 w-44"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMetaBusinessMutation.mutate()}
                  disabled={setMetaBusinessMutation.isPending || !metaBusinessId.trim()}
                >
                  {setMetaBusinessMutation.isPending ? 'Saving…' : 'Save Business ID'}
                </Button>
              </div>
              {setMetaBusinessMutation.isError && (
                <Alert>
                  {setMetaBusinessMutation.error instanceof Error
                    ? setMetaBusinessMutation.error.message
                    : 'Failed to save Business Manager ID.'}
                </Alert>
              )}
              {setMetaBusinessMutation.isSuccess && <Alert variant="success">Business Manager ID saved.</Alert>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>What's live vs. still running in demo mode for this agency.</CardDescription>
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
