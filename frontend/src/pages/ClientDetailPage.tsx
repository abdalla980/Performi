import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ListChecks, X } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { StatTile } from '../components/ui/stat-tile'
import { Textarea } from '../components/ui/textarea'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

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
  const navigate = useNavigate()

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
  const { data: campaigns } = useQuery({
    queryKey: ['briefs', { clientId }],
    queryFn: () => apiClient.listBriefs(clientId),
    enabled: Boolean(clientId),
  })
  const recentCampaigns = useMemo(
    () => [...(campaigns ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [campaigns],
  )

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

  const deleteClientMutation = useMutation({
    mutationFn: () => apiClient.deleteClient(clientId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate('/clients')
    },
  })

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

  const uploadAssetMutation = useMutation({
    mutationFn: ({ kind, file }: { kind: 'logo' | 'image'; file: File }) =>
      apiClient.uploadClientAsset(clientId, kind, file),
    onSuccess: invalidateClient,
  })
  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => apiClient.deleteClientAsset(clientId, assetId),
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

  const [googleCustomerIdInput, setGoogleCustomerIdInput] = useState('')
  const [metaAdAccountIdInput, setMetaAdAccountIdInput] = useState('')

  const setGoogleAdAccountMutation = useMutation({
    mutationFn: (customerId: string) => apiClient.setGoogleAdAccount(clientId, customerId),
    onSuccess: () => {
      setGoogleCustomerIdInput('')
      invalidateClient()
    },
  })
  const setMetaAdAccountMutation = useMutation({
    mutationFn: (adAccountId: string) => apiClient.setMetaAdAccount(clientId, adAccountId),
    onSuccess: () => {
      setMetaAdAccountIdInput('')
      invalidateClient()
    },
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-xl font-semibold text-foreground">{client.name}</h1>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:bg-destructive-muted"
          disabled={deleteClientMutation.isPending}
          onClick={() => {
            if (window.confirm(`Delete ${client.name}? This removes all of their briefs, campaigns, and history.`)) {
              deleteClientMutation.mutate()
            }
          }}
        >
          {deleteClientMutation.isPending ? 'Deleting…' : 'Delete client'}
        </Button>
      </div>

      {deleteClientMutation.isError && (
        <Alert>
          {deleteClientMutation.error instanceof Error ? deleteClientMutation.error.message : 'Failed to delete client.'}
        </Alert>
      )}

      {campaigns && campaigns.length > 0 && (
        <>
          <div role="region" aria-label="Client campaign summary" className="grid grid-cols-2 gap-3">
            <StatTile icon={ListChecks} label="Campaigns" value={campaigns.length} />
            <StatTile
              icon={CheckCircle2}
              label="Launched"
              value={campaigns.filter((c) => c.status === 'launched').length}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent campaigns</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  to={`/campaigns/${campaign.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm hover:border-primary"
                >
                  <span className="truncate text-foreground">{campaign.businessDescription}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}

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
            {client.googleConnected && !client.googleAdsCustomerId ? (
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Google Ads customer ID"
                  placeholder="123-456-7890"
                  value={googleCustomerIdInput}
                  onChange={(event) => setGoogleCustomerIdInput(event.target.value)}
                  className="h-9 w-36"
                />
                <Button
                  aria-label="Save Google Ads customer ID"
                  onClick={() => setGoogleAdAccountMutation.mutate(googleCustomerIdInput.trim())}
                  disabled={setGoogleAdAccountMutation.isPending || !googleCustomerIdInput.trim()}
                >
                  {setGoogleAdAccountMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            ) : client.googleConnected ? (
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
            {client.metaConnected && !client.metaAdAccountId ? (
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Meta ad account ID"
                  placeholder="act_1234567890"
                  value={metaAdAccountIdInput}
                  onChange={(event) => setMetaAdAccountIdInput(event.target.value)}
                  className="h-9 w-36"
                />
                <Button
                  aria-label="Save Meta ad account ID"
                  onClick={() => setMetaAdAccountMutation.mutate(metaAdAccountIdInput.trim())}
                  disabled={setMetaAdAccountMutation.isPending || !metaAdAccountIdInput.trim()}
                >
                  {setMetaAdAccountMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            ) : client.metaConnected ? (
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
          <CardTitle className="text-base">Brand assets</CardTitle>
          <CardDescription>
            Logo and images for this client, the same way Google Ads and Meta ask for creative assets when you build
            a campaign directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="logo-upload">Logo</Label>
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) uploadAssetMutation.mutate({ kind: 'logo', file })
                  event.target.value = ''
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="image-upload">Additional images</Label>
              <Input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) uploadAssetMutation.mutate({ kind: 'image', file })
                  event.target.value = ''
                }}
              />
            </div>
          </div>

          {uploadAssetMutation.isError && (
            <Alert>
              {uploadAssetMutation.error instanceof Error ? uploadAssetMutation.error.message : 'Upload failed.'}
            </Alert>
          )}

          {client.assets.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {client.assets.map((asset) => (
                <div key={asset.id} className="group relative">
                  <img
                    src={`${API_BASE_URL}${asset.url}`}
                    alt={asset.filename}
                    className="h-20 w-20 rounded-md border border-border object-cover"
                  />
                  <Badge variant="default" className="absolute left-1 top-1 capitalize">
                    {asset.kind}
                  </Badge>
                  <button
                    type="button"
                    aria-label={`Remove ${asset.filename}`}
                    onClick={() => deleteAssetMutation.mutate(asset.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
              <p className="text-xs text-muted-foreground">
                How this client's ads should sound. A few descriptive words work best.
              </p>
              <Input
                id="tone"
                placeholder="e.g. friendly and reassuring, not salesy"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="banned-terms">Banned terms (comma-separated)</Label>
              <p className="text-xs text-muted-foreground">
                Words or phrases that should never appear in this client's ads — generated copy using them gets flagged.
              </p>
              <Textarea
                id="banned-terms"
                placeholder="cheap, discount, guaranteed"
                value={bannedTerms}
                onChange={(event) => setBannedTerms(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="required-disclaimers">Required disclaimers (comma-separated)</Label>
              <p className="text-xs text-muted-foreground">
                Legal or compliance text this client needs included, if any (leave blank if not applicable).
              </p>
              <Textarea
                id="required-disclaimers"
                placeholder="Results may vary. License #12345."
                value={requiredDisclaimers}
                onChange={(event) => setRequiredDisclaimers(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="approved-offers">Approved offers (comma-separated)</Label>
              <p className="text-xs text-muted-foreground">
                Specific promotions the client has actually approved — generated copy can only reference offers listed here.
              </p>
              <Textarea
                placeholder="10% off first visit, free consultation"
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
            {saveBrandVoiceMutation.isSuccess && <Alert variant="success">Brand voice saved.</Alert>}
            <Button type="submit" disabled={saveBrandVoiceMutation.isPending} className="self-start">
              {saveBrandVoiceMutation.isPending ? 'Saving…' : 'Save brand voice'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
