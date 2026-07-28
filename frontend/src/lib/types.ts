export interface GoogleKeyword {
  text: string
  matchType: 'exact' | 'phrase' | 'broad'
}

export interface GoogleAdGroupPlan {
  name: string
  keywords: GoogleKeyword[]
  headlines: string[]
  descriptions: string[]
}

export interface Sitelink {
  text: string
  url: string
  description: string | null
}

export interface GoogleCampaignPlan {
  campaignName: string
  dailyBudgetMicros: number
  endDate: string | null
  finalUrl: string | null
  negativeKeywords: string[]
  adGroups: GoogleAdGroupPlan[]
  callouts: string[]
  structuredSnippets: Record<string, string[]>
  sitelinks: Sitelink[]
}

export interface MetaCreative {
  headline: string
  body: string
  callToAction: string
}

export interface MetaAdSetPlan {
  name: string
  dailyBudgetCents: number
  targetingDescription: string
  ageMin: number | null
  ageMax: number | null
  interests: string[]
  creatives: MetaCreative[]
}

export interface MetaCampaignPlan {
  campaignName: string
  objective: string
  websiteUrl: string | null
  adSets: MetaAdSetPlan[]
}

export interface BrandVoiceProfile {
  id: string
  clientId: string
  tone: string
  bannedTerms: string[]
  requiredDisclaimers: string[]
  approvedOffers: string[]
  sitelinks: Sitelink[]
}

export interface BrandVoiceInput {
  tone: string
  bannedTerms: string[]
  requiredDisclaimers: string[]
  approvedOffers: string[]
  sitelinks: Sitelink[]
}

export interface Client {
  id: string
  name: string
  googleAdsCustomerId: string | null
  metaAdAccountId: string | null
  googleConnected: boolean
  metaConnected: boolean
  logoUrl: string | null
}

export interface ClientAsset {
  id: string
  kind: 'logo' | 'image'
  filename: string
  url: string
  createdAt: string
}

export interface ClientDetail extends Client {
  brandVoice: BrandVoiceProfile | null
  assets: ClientAsset[]
}

export type Platform = 'google' | 'meta'

export interface BriefInput {
  clientId: string
  businessDescription: string
  budgetUsd: number
  goals: string
  websiteUrl?: string
  targetLocation?: string
  targetAudience?: string
  endDate?: string
  platforms?: Platform[]
  competitors?: string
  uniqueSellingPoints?: string
  excludedKeywords?: string[]
  servicesOffered?: string[]
  trustSignals?: string[]
  audienceHints?: Array<{ name: string; description: string }>
}

export type CampaignDraftStatus =
  | 'pending_generation'
  | 'adapted'
  | 'guardrail_checked'
  | 'approved'
  | 'rejected'
  | 'client_approved'
  | 'client_rejected'
  | 'launched'
  | 'failed'

export interface DraftSummary {
  id: string
  briefId: string
  clientId: string
  clientName: string
  clientLogoUrl: string | null
  platforms: Platform[]
  status: CampaignDraftStatus
  businessDescription: string
  budgetUsd: number
  goals: string
  guardrailFlagCount: number
  hasBlockingFlags: boolean
  createdAt: string
}

export interface GuardrailFlag {
  severity: 'block' | 'warn'
  code: string
  message: string
}

export interface GuardrailReport {
  id: string
  campaignDraftId: string
  flags: GuardrailFlag[]
  hasBlockingFlags: boolean
}

export interface PlatformLaunchResult {
  platform: 'google' | 'meta'
  status: 'success' | 'failed'
  externalCampaignId: string | null
  errorMessage: string | null
  attemptedAt: string
}

export interface PlatformProjection {
  platform: Platform
  dailyBudgetUsd: number
  estimatedDailyClicks: number
  estimatedDailyImpressions: number
}

export interface ProjectedMetrics {
  platforms: PlatformProjection[]
  estimatedLocationReach: number | null
}

export interface DraftDetail extends DraftSummary {
  websiteUrl: string | null
  targetLocation: string | null
  targetAudience: string | null
  endDate: string | null
  platforms: Platform[]
  competitors: string | null
  uniqueSellingPoints: string | null
  excludedKeywords: string[]
  servicesOffered: string[]
  trustSignals: string[]
  audienceHints: Array<{ name: string; description: string }>
  googlePlan: GoogleCampaignPlan | null
  metaPlan: MetaCampaignPlan | null
  guardrail: GuardrailReport | null
  launches: PlatformLaunchResult[]
  projectedMetrics: ProjectedMetrics | null
}

export interface LaunchResponse {
  status: 'launched' | 'failed'
  externalCampaignId: string | null
  errorMessage: string | null
  platforms: PlatformLaunchResult[]
}

export interface AuditLogEntry {
  id: string
  clientId: string | null
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ImpactStats {
  campaignsLaunched: number
  estimatedHoursSaved: number
  guardrailIssuesCaught: number
}

export interface ConfigStatus {
  anthropicConfigured: boolean
  googleAdsConfigured: boolean
  metaConfigured: boolean
}

export interface GenerateResult {
  id: string
  briefId: string
  status: CampaignDraftStatus
  mode: 'live' | 'demo'
  googlePlan: GoogleCampaignPlan | null
  metaPlan: MetaCampaignPlan | null
}

export type NotificationKind = 'pending_approval_stale' | 'client_pending_stale' | 'guardrail_blocked' | 'launch_failed'

export interface Notification {
  draftId: string
  clientName: string
  kind: NotificationKind
  daysStale: number
}

export interface ApiClient {
  getConfigStatus(): Promise<ConfigStatus>

  listClients(): Promise<Client[]>
  createClient(name: string): Promise<Client>
  getClient(clientId: string): Promise<ClientDetail>
  deleteClient(clientId: string, options?: { force?: boolean }): Promise<void>
  setBrandVoice(clientId: string, brandVoice: BrandVoiceInput): Promise<BrandVoiceProfile>
  connectGoogleDemo(clientId: string): Promise<void>
  connectMetaDemo(clientId: string): Promise<void>
  getAgencyGoogleOAuthUrl(): Promise<string>
  getAgencyMetaOAuthUrl(): Promise<string>
  setGoogleManagerAccount(loginCustomerId: string): Promise<void>
  setMetaBusinessAccount(businessId: string): Promise<void>
  setGoogleAdAccount(clientId: string, customerId: string): Promise<Client>
  setMetaAdAccount(clientId: string, adAccountId: string): Promise<Client>
  uploadClientAsset(clientId: string, kind: 'logo' | 'image', file: File): Promise<ClientAsset>
  deleteClientAsset(clientId: string, assetId: string): Promise<void>

  submitBriefsBatch(briefs: BriefInput[]): Promise<DraftSummary[]>
  listBriefs(clientId?: string): Promise<DraftSummary[]>
  getBrief(draftId: string): Promise<DraftDetail>
  generateDraft(draftId: string): Promise<GenerateResult>
  runGuardrails(draftId: string): Promise<GuardrailReport>
  approveDraft(draftId: string, reviewerNote?: string): Promise<{ status: string }>
  rejectDraft(draftId: string, reviewerNote?: string): Promise<{ status: string }>
  launchDraft(draftId: string): Promise<LaunchResponse>

  listNotifications(): Promise<Notification[]>
  getImpactStats(): Promise<ImpactStats>

  listAuditLog(limit?: number): Promise<AuditLogEntry[]>
}

export type Role = 'agency' | 'client'

export interface WhoAmI {
  role: Role
  id: string
  name: string
  /** Set only for role: 'client' — the agency that manages this client, for white-labeling the client portal. */
  agencyName: string | null
}

export interface ClientPortalCampaignSummary {
  id: string
  briefId: string
  status: CampaignDraftStatus
  businessDescription: string
  budgetUsd: number
  goals: string
  createdAt: string
}

export interface ClientPortalCampaignDetail extends ClientPortalCampaignSummary {
  websiteUrl: string | null
  targetLocation: string | null
  targetAudience: string | null
  endDate: string | null
  platforms: Platform[]
  googlePlan: GoogleCampaignPlan | null
  metaPlan: MetaCampaignPlan | null
  projectedMetrics: ProjectedMetrics | null
  launches: PlatformLaunchResult[]
  agencyContactEmail: string
}

export interface ClientPortalApiClient {
  listCampaigns(): Promise<ClientPortalCampaignSummary[]>
  getCampaign(draftId: string): Promise<ClientPortalCampaignDetail>
  decideCampaign(draftId: string, decision: 'approved' | 'rejected'): Promise<{ status: string }>
  flagLaunchIssue(draftId: string): Promise<{ status: string }>
}
