export interface GoogleAdGroupPlan {
  name: string
  keywords: string[]
  headlines: string[]
  descriptions: string[]
}

export interface GoogleCampaignPlan {
  campaignName: string
  dailyBudgetMicros: number
  endDate: string | null
  adGroups: GoogleAdGroupPlan[]
}

export interface MetaAdSetPlan {
  name: string
  dailyBudgetCents: number
  targetingDescription: string
  creativeHeadline: string
  creativeBody: string
  callToAction: string
}

export interface MetaCampaignPlan {
  campaignName: string
  objective: string
  adSets: MetaAdSetPlan[]
}

export interface BrandVoiceProfile {
  id: string
  clientId: string
  tone: string
  bannedTerms: string[]
  requiredDisclaimers: string[]
  approvedOffers: string[]
}

export interface BrandVoiceInput {
  tone: string
  bannedTerms: string[]
  requiredDisclaimers: string[]
  approvedOffers: string[]
}

export interface Client {
  id: string
  name: string
  googleAdsCustomerId: string | null
  metaAdAccountId: string | null
  googleConnected: boolean
  metaConnected: boolean
}

export interface ClientDetail extends Client {
  brandVoice: BrandVoiceProfile | null
}

export interface BriefInput {
  clientId: string
  businessDescription: string
  budgetUsd: number
  goals: string
}

export type CampaignDraftStatus =
  | 'pending_generation'
  | 'adapted'
  | 'guardrail_checked'
  | 'approved'
  | 'rejected'
  | 'launched'
  | 'failed'

export interface DraftSummary {
  id: string
  briefId: string
  clientId: string
  clientName: string
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
}

export interface DraftDetail extends DraftSummary {
  googlePlan: GoogleCampaignPlan | null
  metaPlan: MetaCampaignPlan | null
  guardrail: GuardrailReport | null
  launches: PlatformLaunchResult[]
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
  googlePlan: GoogleCampaignPlan
  metaPlan: MetaCampaignPlan
}

export interface ApiClient {
  getConfigStatus(): Promise<ConfigStatus>

  listClients(): Promise<Client[]>
  createClient(name: string): Promise<Client>
  getClient(clientId: string): Promise<ClientDetail>
  setBrandVoice(clientId: string, brandVoice: BrandVoiceInput): Promise<BrandVoiceProfile>
  connectGoogleDemo(clientId: string): Promise<void>
  connectMetaDemo(clientId: string): Promise<void>

  submitBriefsBatch(briefs: BriefInput[]): Promise<DraftSummary[]>
  listBriefs(clientId?: string): Promise<DraftSummary[]>
  getBrief(draftId: string): Promise<DraftDetail>
  generateDraft(draftId: string): Promise<GenerateResult>
  runGuardrails(draftId: string): Promise<GuardrailReport>
  approveDraft(draftId: string, reviewerNote?: string): Promise<{ status: string }>
  rejectDraft(draftId: string, reviewerNote?: string): Promise<{ status: string }>
  launchDraft(draftId: string): Promise<LaunchResponse>

  listAuditLog(limit?: number): Promise<AuditLogEntry[]>
}
