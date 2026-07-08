import type { ApiClient, CampaignDraft, LaunchResult } from './types'

// Stands in for the real backend (Task 9 in the build plan). Returns plausible
// canned data so the frontend can be built and demoed before the backend exists.
// Swapped for a real fetch-based client once the backend is up (see apiClient.http.ts).
export function createMockApiClient(): ApiClient {
  return {
    async submitBrief(_brief): Promise<CampaignDraft> {
      return {
        id: 'draft-mock-1',
        briefId: 'brief-mock-1',
        status: 'pending_generation',
        googlePlan: null,
      }
    },

    async generateDraft(draftId): Promise<CampaignDraft> {
      return {
        id: draftId,
        briefId: 'brief-mock-1',
        status: 'adapted',
        googlePlan: {
          campaignName: 'Mock Campaign',
          dailyBudgetMicros: 20_000_000,
          adGroups: [
            {
              name: 'Mock Campaign - Primary',
              keywords: ['example keyword one', 'example keyword two'],
              headlines: ['Example Headline'],
              descriptions: ['Example description of the mocked ad.'],
            },
          ],
        },
      }
    },

    async launchDraft(draftId): Promise<LaunchResult> {
      return {
        status: 'launched',
        externalCampaignId: `mock-external-${draftId}`,
        errorMessage: null,
      }
    },
  }
}
