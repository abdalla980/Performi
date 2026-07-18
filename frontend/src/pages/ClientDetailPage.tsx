import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'

function toList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function ClientDetailPage() {
  const { clientId = '' } = useParams<{ clientId: string }>()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()

  const clientQueryKey = ['clients', clientId] as const

  const {
    data: client,
    isPending,
    isError,
  } = useQuery({
    queryKey: clientQueryKey,
    queryFn: () => apiClient.getClient(clientId),
    enabled: Boolean(clientId),
  })
  const { data: configStatus } = useQuery({ queryKey: ['config-status'], queryFn: () => apiClient.getConfigStatus() })

  const [tone, setTone] = useState('')
  const [bannedTerms, setBannedTerms] = useState('')
  const [requiredDisclaimers, setRequiredDisclaimers] = useState('')
  const [approvedOffers, setApprovedOffers] = useState('')

  useEffect(() => {
    if (client?.brandVoice) {
      setTone(client.brandVoice.tone)
      setBannedTerms(client.brandVoice.bannedTerms.join(', '))
      setRequiredDisclaimers(client.brandVoice.requiredDisclaimers.join(', '))
      setApprovedOffers(client.brandVoice.approvedOffers.join(', '))
    }
  }, [client?.brandVoice])

  const invalidateClient = () => queryClient.invalidateQueries({ queryKey: clientQueryKey })

  const saveBrandVoiceMutation = useMutation({
    mutationFn: () =>
      apiClient.setBrandVoice(clientId, {
        tone,
        bannedTerms: toList(bannedTerms),
        requiredDisclaimers: toList(requiredDisclaimers),
        approvedOffers: toList(approvedOffers),
      }),
    onSuccess: invalidateClient,
  })

  const connectGoogleMutation = useMutation({
    mutationFn: () => apiClient.connectGoogleDemo(clientId),
    onSuccess: invalidateClient,
  })
  const connectMetaMutation = useMutation({
    mutationFn: () => apiClient.connectMetaDemo(clientId),
    onSuccess: invalidateClient,
  })
  const connectGoogleLiveMutation = useMutation({
    mutationFn: () => apiClient.getGoogleOAuthUrl(clientId),
    onSuccess: (authorizeUrl) => window.location.assign(authorizeUrl),
  })
  const connectMetaLiveMutation = useMutation({
    mutationFn: () => apiClient.getMetaOAuthUrl(clientId),
    onSuccess: (authorizeUrl) => window.location.assign(authorizeUrl),
  })

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading client…</p>
  }
  if (isError || !client) {
    return <Alert>Couldn't load this client.</Alert>
  }

  const anyPlatformUnconfigured =
    !configStatus || !configStatus.googleAdsConfigured || !configStatus.metaConfigured

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{client.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ad account connections</CardTitle>
          <CardDescription>
            {anyPlatformUnconfigured
              ? "Live OAuth isn't configured yet for every platform — connect in demo mode to exercise the full pipeline in the meantime."
              : 'Connect a real account, or use demo mode to exercise the pipeline without one.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Google Ads</p>
              <p className="text-xs text-muted-foreground">{client.googleAdsCustomerId ?? 'Not connected'}</p>
            </div>
            {client.googleConnected ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <div className="flex gap-2">
                {configStatus?.googleAdsConfigured && (
                  <Button
                    onClick={() => connectGoogleLiveMutation.mutate()}
                    disabled={connectGoogleLiveMutation.isPending}
                  >
                    {connectGoogleLiveMutation.isPending ? 'Redirecting…' : 'Connect (Live)'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => connectGoogleMutation.mutate()}
                  disabled={connectGoogleMutation.isPending}
                >
                  {connectGoogleMutation.isPending ? 'Connecting…' : 'Connect (Demo)'}
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Meta</p>
              <p className="text-xs text-muted-foreground">{client.metaAdAccountId ?? 'Not connected'}</p>
            </div>
            {client.metaConnected ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <div className="flex gap-2">
                {configStatus?.metaConfigured && (
                  <Button onClick={() => connectMetaLiveMutation.mutate()} disabled={connectMetaLiveMutation.isPending}>
                    {connectMetaLiveMutation.isPending ? 'Redirecting…' : 'Connect (Live)'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => connectMetaMutation.mutate()}
                  disabled={connectMetaMutation.isPending}
                >
                  {connectMetaMutation.isPending ? 'Connecting…' : 'Connect (Demo)'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand voice</CardTitle>
          <CardDescription>Guides how campaigns are generated and checked for this client.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              saveBrandVoiceMutation.mutate()
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="tone">Tone</Label>
              <Input id="tone" value={tone} onChange={(event) => setTone(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banned-terms">Banned terms (comma-separated)</Label>
              <Textarea id="banned-terms" value={bannedTerms} onChange={(event) => setBannedTerms(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="required-disclaimers">Required disclaimers (comma-separated)</Label>
              <Textarea
                id="required-disclaimers"
                value={requiredDisclaimers}
                onChange={(event) => setRequiredDisclaimers(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="approved-offers">Approved offers (comma-separated)</Label>
              <Textarea
                id="approved-offers"
                value={approvedOffers}
                onChange={(event) => setApprovedOffers(event.target.value)}
              />
            </div>
            {saveBrandVoiceMutation.isError && (
              <Alert>
                {saveBrandVoiceMutation.error instanceof Error
                  ? saveBrandVoiceMutation.error.message
                  : 'Failed to save brand voice.'}
              </Alert>
            )}
            <Button type="submit" disabled={saveBrandVoiceMutation.isPending} className="self-start">
              {saveBrandVoiceMutation.isPending ? 'Saving…' : 'Save brand voice'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
