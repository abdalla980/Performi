export interface GoogleAdGroupPlan {
  name: string
  keywords: string[]
  headlines: string[]
  descriptions: string[]
}

export interface GoogleCampaignPlan {
  campaignName: string
  dailyBudgetMicros: number
  adGroups: GoogleAdGroupPlan[]
}

export interface BriefInput {
  clientId: string
  businessDescription: string
  budgetUsd: number
  goals: string
}

export type CampaignDraftStatus = 'pending_generation' | 'generated' | 'adapted' | 'launched' | 'failed'

export interface CampaignDraft {
  id: string
  briefId: string
  status: CampaignDraftStatus
  googlePlan: GoogleCampaignPlan | null
}

export interface LaunchResult {
  status: 'launched' | 'failed'
  externalCampaignId: string | null
  errorMessage: string | null
}

export interface ApiClient {
  submitBrief(brief: BriefInput): Promise<CampaignDraft>
  generateDraft(draftId: string): Promise<CampaignDraft>
  launchDraft(draftId: string): Promise<LaunchResult>
}
