import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, ListChecks, X } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { buildPlatformManageUrl, PLATFORM_LABEL } from '../lib/platformLinks'
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
  const [sitelinks, setSitelinks] = useState<Array<{ text: string; url: string; description: string }>>([])
  const [showLaunchedWarning, setShowLaunchedWarning] = useState(false)

  const launchedCampaigns = useMemo(
    () => (campaigns ?? []).filter((c) => c.status === 'launched'),
    [campaigns],
  )

  useEffect(() => {
    if (client?.brandVoice) {
      setTone(client.brandVoice.tone)
      setBannedTerms(client.brandVoice.bannedTerms.join(', '))
      setRequiredDisclaimers(client.brandVoice.requiredDisclaimers.join(', '))
      setApprovedOffers(client.brandVoice.approvedOffers.join(', '))
      setSitelinks(
        client.brandVoice.sitelinks.map((link) => ({
          text: link.text,
          url: link.url,
          description: link.description ?? '',
        })),
      )
    }
  }, [client?.brandVoice])

  const invalidateClient = () => queryClient.invalidateQueries({ queryKey: clientQueryKey })

  const deleteClientMutation = useMutation({
    mutationFn: (options?: { force?: boolean }) => apiClient.deleteClient(clientId, options),
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
        sitelinks: sitelinks
          .filter((link) => link.text.trim() && link.url.trim())
          .map((link) => ({
            text: link.text.trim(),
            url: link.url.trim(),
            description: link.description.trim() || null,
          })),
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

  const [googleCustomerIdInput, setGoogleCustomerIdInput] = useState('')
  const [metaAdAccountIdInput, setMetaAdAccountIdInput] = useState('')

  useEffect(() => {
    if (client?.googleAdsCustomerId) setGoogleCustomerIdInput(client.googleAdsCustomerId)
    if (client?.metaAdAccountId) setMetaAdAccountIdInput(client.metaAdAccountId)
  }, [client?.googleAdsCustomerId, client?.metaAdAccountId])

  const setGoogleAdAccountMutation = useMutation({
    mutationFn: (customerId: string) => apiClient.setGoogleAdAccount(clientId, customerId),
    onSuccess: invalidateClient,
  })
  const setMetaAdAccountMutation = useMutation({
    mutationFn: (adAccountId: string) => apiClient.setMetaAdAccount(clientId, adAccountId),
    onSuccess: invalidateClient,
  })

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading client…</p>
  }
  if (isError || !client) {
    return <Alert>Couldn't load this client.</Alert>
  }

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
            if (launchedCampaigns.length === 0) {
              if (
                window.confirm(
                  `Delete ${client.name}? This removes all of their briefs, campaigns, and history.`,
                )
              ) {
                deleteClientMutation.mutate({ force: false })
              }
              return
            }
            setShowLaunchedWarning(true)
          }}
        >
          {deleteClientMutation.isPending ? 'Deleting…' : 'Delete client'}
        </Button>
      </div>

      {showLaunchedWarning && (
        <Alert>
          <div className="flex flex-col gap-3">
            <p>
              {launchedCampaigns.length} campaign{launchedCampaigns.length === 1 ? '' : 's'} for this client{' '}
              {launchedCampaigns.length === 1 ? 'is' : 'are'} still marked launched. Deleting will not pause them —
              they&apos;ll keep running until you stop them in the platform itself.
            </p>
            <ul className="flex flex-col gap-2">
              {launchedCampaigns.map((campaign) => (
                <li key={campaign.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/campaigns/${campaign.id}`} className="font-medium text-foreground hover:underline">
                    {campaign.businessDescription}
                  </Link>
                  {(['google', 'meta'] as const)
                    .filter((platform) => campaign.platforms.includes(platform))
                    .map((platform) => (
                      <a
                        key={platform}
                        href={buildPlatformManageUrl(platform, {
                          metaAdAccountId: client.metaAdAccountId,
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Manage in {PLATFORM_LABEL[platform]}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ))}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:bg-destructive-muted"
                disabled={deleteClientMutation.isPending}
                onClick={() => deleteClientMutation.mutate({ force: true })}
              >
                Delete anyway
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowLaunchedWarning(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Alert>
      )}

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
          <CardTitle className="text-base">Linked ad accounts</CardTitle>
          <CardDescription>
            Paste each client's Google Customer ID / Meta Ad Account ID after you've linked them under your manager
            account in Settings. Use demo connect to exercise the pipeline without live credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Google Ads</p>
              {client.googleConnected ? <Badge variant="success">Linked</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Google Ads customer ID"
                placeholder="123-456-7890"
                value={googleCustomerIdInput}
                onChange={(event) => setGoogleCustomerIdInput(event.target.value)}
                className="h-9 w-44"
              />
              <Button
                aria-label="Save Google Ads customer ID"
                onClick={() => setGoogleAdAccountMutation.mutate(googleCustomerIdInput.trim())}
                disabled={setGoogleAdAccountMutation.isPending || !googleCustomerIdInput.trim()}
              >
                {setGoogleAdAccountMutation.isPending ? 'Saving…' : 'Save ID'}
              </Button>
              <Button
                variant="outline"
                onClick={() => connectGoogleMutation.mutate()}
                disabled={connectGoogleMutation.isPending}
              >
                {connectGoogleMutation.isPending ? 'Connecting…' : 'Connect (Demo)'}
              </Button>
            </div>
            {setGoogleAdAccountMutation.isError && (
              <p className="mt-2 text-xs text-destructive">
                {setGoogleAdAccountMutation.error instanceof Error
                  ? setGoogleAdAccountMutation.error.message
                  : 'Failed to save Google customer ID.'}
              </p>
            )}
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Meta</p>
              {client.metaConnected ? <Badge variant="success">Linked</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Meta ad account ID"
                placeholder="act_1234567890"
                value={metaAdAccountIdInput}
                onChange={(event) => setMetaAdAccountIdInput(event.target.value)}
                className="h-9 w-44"
              />
              <Button
                aria-label="Save Meta ad account ID"
                onClick={() => setMetaAdAccountMutation.mutate(metaAdAccountIdInput.trim())}
                disabled={setMetaAdAccountMutation.isPending || !metaAdAccountIdInput.trim()}
              >
                {setMetaAdAccountMutation.isPending ? 'Saving…' : 'Save ID'}
              </Button>
              <Button
                variant="outline"
                onClick={() => connectMetaMutation.mutate()}
                disabled={connectMetaMutation.isPending}
              >
                {connectMetaMutation.isPending ? 'Connecting…' : 'Connect (Demo)'}
              </Button>
            </div>
            {setMetaAdAccountMutation.isError && (
              <p className="mt-2 text-xs text-destructive">
                {setMetaAdAccountMutation.error instanceof Error
                  ? setMetaAdAccountMutation.error.message
                  : 'Failed to save Meta ad account ID.'}
              </p>
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
            <div className="flex flex-col gap-3">
              <div>
                <Label>Google sitelinks</Label>
                <p className="text-xs text-muted-foreground">
                  Real pages on this client's site. Attached to Google campaigns at launch — not AI-generated.
                </p>
              </div>
              {sitelinks.map((link, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Input
                    aria-label={`Sitelink ${index + 1} text`}
                    placeholder="Link text"
                    value={link.text}
                    onChange={(event) =>
                      setSitelinks((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, text: event.target.value } : row)),
                      )
                    }
                  />
                  <Input
                    aria-label={`Sitelink ${index + 1} URL`}
                    placeholder="https://…"
                    value={link.url}
                    onChange={(event) =>
                      setSitelinks((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, url: event.target.value } : row)),
                      )
                    }
                  />
                  <Input
                    aria-label={`Sitelink ${index + 1} description`}
                    placeholder="Description (optional)"
                    value={link.description}
                    onChange={(event) =>
                      setSitelinks((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSitelinks((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => setSitelinks((rows) => [...rows, { text: '', url: '', description: '' }])}
              >
                Add sitelink
              </Button>
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
