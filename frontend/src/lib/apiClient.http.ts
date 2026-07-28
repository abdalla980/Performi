import type {
  ApiClient,
  AuditLogEntry,
  BrandVoiceInput,
  BrandVoiceProfile,
  BriefInput,
  Client,
  ClientAsset,
  ClientDetail,
  ConfigStatus,
  DraftDetail,
  DraftSummary,
  GenerateResult,
  GoogleCampaignPlan,
  GuardrailReport,
  ImpactStats,
  LaunchResponse,
  MetaCampaignPlan,
  Notification,
  Platform,
  PlatformLaunchResult,
  PlatformProjection,
  ProjectedMetrics,
} from './types'

interface HttpApiClientOptions {
  baseUrl: string
  getAuthToken: () => Promise<string>
  fetchFn?: typeof fetch
}

interface RawGoogleKeyword {
  text: string
  match_type: 'exact' | 'phrase' | 'broad'
}

interface RawGoogleAdGroup {
  name: string
  keywords: RawGoogleKeyword[]
  headlines: string[]
  descriptions: string[]
}

interface RawSitelink {
  text: string
  url: string
  description: string | null
}

export interface RawGooglePlan {
  campaign_name: string
  daily_budget_micros: number
  end_date: string | null
  final_url: string | null
  negative_keywords: string[]
  ad_groups: RawGoogleAdGroup[]
  callouts?: string[]
  structured_snippets?: Record<string, string[]>
  sitelinks?: RawSitelink[]
}

interface RawMetaCreative {
  headline: string
  body: string
  call_to_action: string
}

interface RawMetaAdSet {
  name: string
  daily_budget_cents: number
  targeting_description: string
  age_min?: number | null
  age_max?: number | null
  interests?: string[]
  creatives: RawMetaCreative[]
}

export interface RawMetaPlan {
  campaign_name: string
  objective: string
  website_url: string | null
  ad_sets: RawMetaAdSet[]
}

interface RawBrandVoice {
  id: string
  client_id: string
  tone: string
  banned_terms: string[]
  required_disclaimers: string[]
  approved_offers: string[]
  sitelinks?: RawSitelink[]
}

interface RawClient {
  id: string
  name: string
  google_ads_customer_id: string | null
  meta_ad_account_id: string | null
  google_connected: boolean
  meta_connected: boolean
  logo_url: string | null
}

interface RawClientAsset {
  id: string
  kind: 'logo' | 'image'
  filename: string
  url: string
  created_at: string
}

interface RawClientDetail extends RawClient {
  brand_voice: RawBrandVoice | null
  assets: RawClientAsset[]
}

interface RawGuardrailFlag {
  severity: 'block' | 'warn'
  code: string
  message: string
}

interface RawGuardrailReport {
  id: string
  campaign_draft_id: string
  flags: RawGuardrailFlag[]
  has_blocking_flags: boolean
}

export interface RawPlatformLaunchResult {
  platform: 'google' | 'meta'
  status: 'success' | 'failed'
  external_campaign_id: string | null
  error_message: string | null
  attempted_at: string
}

interface RawDraftSummary {
  id: string
  brief_id: string
  client_id: string
  client_name: string
  client_logo_url: string | null
  platforms: Platform[]
  status: DraftSummary['status']
  business_description: string
  budget_usd: number
  goals: string
  guardrail_flag_count: number
  has_blocking_flags: boolean
  created_at: string
}

interface RawPlatformProjection {
  platform: Platform
  daily_budget_usd: number
  estimated_daily_clicks: number
  estimated_daily_impressions: number
}

export interface RawProjectedMetrics {
  platforms: RawPlatformProjection[]
  estimated_location_reach: number | null
}

interface RawDraftDetail extends RawDraftSummary {
  website_url: string | null
  target_location: string | null
  target_audience: string | null
  end_date: string | null
  platforms: Platform[]
  competitors: string | null
  unique_selling_points: string | null
  excluded_keywords: string[]
  google_plan: RawGooglePlan | null
  meta_plan: RawMetaPlan | null
  guardrail: RawGuardrailReport | null
  launches: RawPlatformLaunchResult[]
  projected_metrics: RawProjectedMetrics | null
}

interface RawLaunchResponse {
  status: 'launched' | 'failed'
  external_campaign_id: string | null
  error_message: string | null
  platforms: RawPlatformLaunchResult[]
}

interface RawAuditEntry {
  id: string
  client_id: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

interface RawOAuthAuthorizeUrl {
  authorize_url: string
}

interface RawConfigStatus {
  anthropic_configured: boolean
  google_ads_configured: boolean
  meta_configured: boolean
}

interface RawGenerateResult {
  id: string
  brief_id: string
  status: DraftSummary['status']
  mode: 'live' | 'demo'
  google_plan: RawGooglePlan | null
  meta_plan: RawMetaPlan | null
}

interface RawNotification {
  draft_id: string
  client_name: string
  kind: Notification['kind']
  days_stale: number
}

interface RawImpactStats {
  campaigns_launched: number
  estimated_hours_saved: number
  guardrail_issues_caught: number
}

export function toGooglePlan(raw: RawGooglePlan): GoogleCampaignPlan {
  return {
    campaignName: raw.campaign_name,
    dailyBudgetMicros: raw.daily_budget_micros,
    endDate: raw.end_date,
    finalUrl: raw.final_url,
    negativeKeywords: raw.negative_keywords,
    adGroups: raw.ad_groups.map((group) => ({
      name: group.name,
      keywords: group.keywords.map((keyword) => ({
        text: keyword.text,
        matchType: keyword.match_type ?? 'phrase',
      })),
      headlines: group.headlines,
      descriptions: group.descriptions,
    })),
    callouts: raw.callouts ?? [],
    structuredSnippets: raw.structured_snippets ?? {},
    sitelinks: (raw.sitelinks ?? []).map((link) => ({
      text: link.text,
      url: link.url,
      description: link.description,
    })),
  }
}

export function toMetaPlan(raw: RawMetaPlan): MetaCampaignPlan {
  return {
    campaignName: raw.campaign_name,
    objective: raw.objective,
    websiteUrl: raw.website_url,
    adSets: raw.ad_sets.map((adSet) => ({
      name: adSet.name,
      dailyBudgetCents: adSet.daily_budget_cents,
      targetingDescription: adSet.targeting_description,
      ageMin: adSet.age_min ?? null,
      ageMax: adSet.age_max ?? null,
      interests: adSet.interests ?? [],
      creatives: adSet.creatives.map((creative) => ({
        headline: creative.headline,
        body: creative.body,
        callToAction: creative.call_to_action,
      })),
    })),
  }
}

function toBrandVoice(raw: RawBrandVoice): BrandVoiceProfile {
  return {
    id: raw.id,
    clientId: raw.client_id,
    tone: raw.tone,
    bannedTerms: raw.banned_terms,
    requiredDisclaimers: raw.required_disclaimers,
    approvedOffers: raw.approved_offers,
    sitelinks: (raw.sitelinks ?? []).map((link) => ({
      text: link.text,
      url: link.url,
      description: link.description,
    })),
  }
}

function toClientAsset(raw: RawClientAsset): ClientAsset {
  return {
    id: raw.id,
    kind: raw.kind,
    filename: raw.filename,
    url: raw.url,
    createdAt: raw.created_at,
  }
}

function toClient(raw: RawClient): Client {
  return {
    id: raw.id,
    name: raw.name,
    googleAdsCustomerId: raw.google_ads_customer_id,
    metaAdAccountId: raw.meta_ad_account_id,
    googleConnected: raw.google_connected,
    metaConnected: raw.meta_connected,
    logoUrl: raw.logo_url,
  }
}

function toClientDetail(raw: RawClientDetail): ClientDetail {
  return {
    ...toClient(raw),
    brandVoice: raw.brand_voice ? toBrandVoice(raw.brand_voice) : null,
    assets: raw.assets.map(toClientAsset),
  }
}

function toGuardrailReport(raw: RawGuardrailReport): GuardrailReport {
  return {
    id: raw.id,
    campaignDraftId: raw.campaign_draft_id,
    flags: raw.flags.map((flag) => ({ severity: flag.severity, code: flag.code, message: flag.message })),
    hasBlockingFlags: raw.has_blocking_flags,
  }
}

export function toPlatformLaunchResult(raw: RawPlatformLaunchResult): PlatformLaunchResult {
  return {
    platform: raw.platform,
    status: raw.status,
    externalCampaignId: raw.external_campaign_id,
    errorMessage: raw.error_message,
    attemptedAt: raw.attempted_at,
  }
}

function toDraftSummary(raw: RawDraftSummary): DraftSummary {
  return {
    id: raw.id,
    briefId: raw.brief_id,
    clientId: raw.client_id,
    clientName: raw.client_name,
    clientLogoUrl: raw.client_logo_url,
    platforms: raw.platforms,
    status: raw.status,
    businessDescription: raw.business_description,
    budgetUsd: raw.budget_usd,
    goals: raw.goals,
    guardrailFlagCount: raw.guardrail_flag_count,
    hasBlockingFlags: raw.has_blocking_flags,
    createdAt: raw.created_at,
  }
}

function toPlatformProjection(raw: RawPlatformProjection): PlatformProjection {
  return {
    platform: raw.platform,
    dailyBudgetUsd: raw.daily_budget_usd,
    estimatedDailyClicks: raw.estimated_daily_clicks,
    estimatedDailyImpressions: raw.estimated_daily_impressions,
  }
}

export function toProjectedMetrics(raw: RawProjectedMetrics): ProjectedMetrics {
  return {
    platforms: raw.platforms.map(toPlatformProjection),
    estimatedLocationReach: raw.estimated_location_reach,
  }
}

function toDraftDetail(raw: RawDraftDetail): DraftDetail {
  return {
    ...toDraftSummary(raw),
    websiteUrl: raw.website_url,
    targetLocation: raw.target_location,
    targetAudience: raw.target_audience,
    endDate: raw.end_date,
    platforms: raw.platforms,
    competitors: raw.competitors,
    uniqueSellingPoints: raw.unique_selling_points,
    excludedKeywords: raw.excluded_keywords,
    googlePlan: raw.google_plan ? toGooglePlan(raw.google_plan) : null,
    metaPlan: raw.meta_plan ? toMetaPlan(raw.meta_plan) : null,
    guardrail: raw.guardrail ? toGuardrailReport(raw.guardrail) : null,
    launches: raw.launches.map(toPlatformLaunchResult),
    projectedMetrics: raw.projected_metrics ? toProjectedMetrics(raw.projected_metrics) : null,
  }
}

function toLaunchResponse(raw: RawLaunchResponse): LaunchResponse {
  return {
    status: raw.status,
    externalCampaignId: raw.external_campaign_id,
    errorMessage: raw.error_message,
    platforms: raw.platforms.map(toPlatformLaunchResult),
  }
}

function toAuditEntry(raw: RawAuditEntry): AuditLogEntry {
  return {
    id: raw.id,
    clientId: raw.client_id,
    eventType: raw.event_type,
    payload: raw.payload,
    createdAt: raw.created_at,
  }
}

function toConfigStatus(raw: RawConfigStatus): ConfigStatus {
  return {
    anthropicConfigured: raw.anthropic_configured,
    googleAdsConfigured: raw.google_ads_configured,
    metaConfigured: raw.meta_configured,
  }
}

function toGenerateResult(raw: RawGenerateResult): GenerateResult {
  return {
    id: raw.id,
    briefId: raw.brief_id,
    status: raw.status,
    mode: raw.mode,
    googlePlan: raw.google_plan ? toGooglePlan(raw.google_plan) : null,
    metaPlan: raw.meta_plan ? toMetaPlan(raw.meta_plan) : null,
  }
}

function toNotification(raw: RawNotification): Notification {
  return { draftId: raw.draft_id, clientName: raw.client_name, kind: raw.kind, daysStale: raw.days_stale }
}

function toImpactStats(raw: RawImpactStats): ImpactStats {
  return {
    campaignsLaunched: raw.campaigns_launched,
    estimatedHoursSaved: raw.estimated_hours_saved,
    guardrailIssuesCaught: raw.guardrail_issues_caught,
  }
}

export function createHttpApiClient({ baseUrl, getAuthToken, fetchFn = fetch }: HttpApiClientOptions): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getAuthToken()
    const response = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    if (response.status === 204) {
      return undefined as T
    }
    return (await response.json()) as T
  }

  const get = <T>(path: string) => request<T>('GET', path)
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
  const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, body)

  return {
    async getConfigStatus(): Promise<ConfigStatus> {
      return toConfigStatus(await get<RawConfigStatus>('/config/status'))
    },

    async listClients(): Promise<Client[]> {
      const raw = await get<RawClient[]>('/clients')
      return raw.map(toClient)
    },

    async createClient(name: string): Promise<Client> {
      return toClient(await post<RawClient>('/clients', { name }))
    },

    async getClient(clientId: string): Promise<ClientDetail> {
      return toClientDetail(await get<RawClientDetail>(`/clients/${clientId}`))
    },

    async deleteClient(clientId: string): Promise<void> {
      await request('DELETE', `/clients/${clientId}`)
    },

    async setBrandVoice(clientId: string, brandVoice: BrandVoiceInput): Promise<BrandVoiceProfile> {
      const raw = await put<RawBrandVoice>(`/clients/${clientId}/brand-voice`, {
        tone: brandVoice.tone,
        banned_terms: brandVoice.bannedTerms,
        required_disclaimers: brandVoice.requiredDisclaimers,
        approved_offers: brandVoice.approvedOffers,
        sitelinks: brandVoice.sitelinks.map((link) => ({
          text: link.text,
          url: link.url,
          description: link.description,
        })),
      })
      return toBrandVoice(raw)
    },

    async connectGoogleDemo(clientId: string): Promise<void> {
      await post(`/clients/${clientId}/google/demo-connect`)
    },

    async connectMetaDemo(clientId: string): Promise<void> {
      await post(`/clients/${clientId}/meta/demo-connect`)
    },

    async getGoogleOAuthUrl(clientId: string): Promise<string> {
      const raw = await get<RawOAuthAuthorizeUrl>(`/clients/${clientId}/google/oauth/start`)
      return raw.authorize_url
    },

    async getMetaOAuthUrl(clientId: string): Promise<string> {
      const raw = await get<RawOAuthAuthorizeUrl>(`/clients/${clientId}/meta/oauth/start`)
      return raw.authorize_url
    },

    async setGoogleAdAccount(clientId: string, customerId: string): Promise<Client> {
      return toClient(await put<RawClient>(`/clients/${clientId}/google/ad-account`, { customer_id: customerId }))
    },

    async setMetaAdAccount(clientId: string, adAccountId: string): Promise<Client> {
      return toClient(await put<RawClient>(`/clients/${clientId}/meta/ad-account`, { ad_account_id: adAccountId }))
    },

    async uploadClientAsset(clientId: string, kind: 'logo' | 'image', file: File): Promise<ClientAsset> {
      const token = await getAuthToken()
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('file', file)
      // No Content-Type header here — the browser sets the multipart boundary itself
      // when the body is FormData; setting it manually breaks the upload.
      const response = await fetchFn(`${baseUrl}/clients/${clientId}/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      return toClientAsset((await response.json()) as RawClientAsset)
    },

    async deleteClientAsset(clientId: string, assetId: string): Promise<void> {
      await request('DELETE', `/clients/${clientId}/assets/${assetId}`)
    },

    async submitBriefsBatch(briefs: BriefInput[]): Promise<DraftSummary[]> {
      const raw = await post<RawDraftSummary[]>('/briefs/batch', {
        briefs: briefs.map((brief) => ({
          client_id: brief.clientId,
          business_description: brief.businessDescription,
          budget_usd: brief.budgetUsd,
          goals: brief.goals,
          website_url: brief.websiteUrl,
          target_location: brief.targetLocation,
          target_audience: brief.targetAudience,
          end_date: brief.endDate,
          platforms: brief.platforms,
          competitors: brief.competitors,
          unique_selling_points: brief.uniqueSellingPoints,
          excluded_keywords: brief.excludedKeywords,
        })),
      })
      return raw.map(toDraftSummary)
    },

    async listBriefs(clientId?: string): Promise<DraftSummary[]> {
      const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
      const raw = await get<RawDraftSummary[]>(`/briefs${query}`)
      return raw.map(toDraftSummary)
    },

    async getBrief(draftId: string): Promise<DraftDetail> {
      return toDraftDetail(await get<RawDraftDetail>(`/briefs/${draftId}`))
    },

    async generateDraft(draftId: string): Promise<GenerateResult> {
      return toGenerateResult(await post<RawGenerateResult>(`/briefs/${draftId}/generate`))
    },

    async runGuardrails(draftId: string): Promise<GuardrailReport> {
      return toGuardrailReport(await post<RawGuardrailReport>(`/briefs/${draftId}/guardrails/run`))
    },

    async approveDraft(draftId: string, reviewerNote?: string): Promise<{ status: string }> {
      return post(`/briefs/${draftId}/approve`, { decision: 'approved', reviewer_note: reviewerNote ?? null })
    },

    async rejectDraft(draftId: string, reviewerNote?: string): Promise<{ status: string }> {
      return post(`/briefs/${draftId}/approve`, { decision: 'rejected', reviewer_note: reviewerNote ?? null })
    },

    async launchDraft(draftId: string): Promise<LaunchResponse> {
      return toLaunchResponse(await post<RawLaunchResponse>(`/briefs/${draftId}/launch`))
    },

    async listNotifications(): Promise<Notification[]> {
      const raw = await get<RawNotification[]>('/notifications')
      return raw.map(toNotification)
    },

    async getImpactStats(): Promise<ImpactStats> {
      return toImpactStats(await get<RawImpactStats>('/stats/impact'))
    },

    async listAuditLog(limit = 100): Promise<AuditLogEntry[]> {
      const raw = await get<RawAuditEntry[]>(`/audit-log?limit=${limit}`)
      return raw.map(toAuditEntry)
    },
  }
}
