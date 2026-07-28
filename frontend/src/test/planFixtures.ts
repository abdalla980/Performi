import type { GoogleCampaignPlan, MetaCampaignPlan } from '../lib/types'

export function emptyGooglePlan(overrides: Partial<GoogleCampaignPlan> = {}): GoogleCampaignPlan {
  return {
    campaignName: 'Austin Bakery',
    dailyBudgetMicros: 16_500_000,
    endDate: null,
    finalUrl: null,
    negativeKeywords: [],
    adGroups: [],
    callouts: [],
    structuredSnippets: {},
    sitelinks: [],
    ...overrides,
  }
}

export function emptyMetaPlan(overrides: Partial<MetaCampaignPlan> = {}): MetaCampaignPlan {
  return {
    campaignName: 'Austin Bakery',
    objective: 'traffic',
    websiteUrl: null,
    adSets: [],
    ...overrides,
  }
}
