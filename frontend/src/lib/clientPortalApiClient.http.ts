import {
  toGooglePlan,
  toMetaPlan,
  toPlatformLaunchResult,
  toProjectedMetrics,
  type RawGooglePlan,
  type RawMetaPlan,
  type RawPlatformLaunchResult,
  type RawProjectedMetrics,
} from './apiClient.http'
import type { ClientPortalApiClient, ClientPortalCampaignDetail, ClientPortalCampaignSummary, Platform } from './types'

interface HttpClientPortalApiClientOptions {
  baseUrl: string
  getAuthToken: () => Promise<string>
  fetchFn?: typeof fetch
}

interface RawCampaignSummary {
  id: string
  brief_id: string
  status: ClientPortalCampaignSummary['status']
  business_description: string
  budget_usd: number
  goals: string
  created_at: string
}

interface RawCampaignDetail extends RawCampaignSummary {
  website_url: string | null
  target_location: string | null
  target_audience: string | null
  end_date: string | null
  platforms: Platform[]
  google_plan: RawGooglePlan | null
  meta_plan: RawMetaPlan | null
  projected_metrics: RawProjectedMetrics | null
  launches: RawPlatformLaunchResult[]
  agency_contact_email: string
}

function toCampaignSummary(raw: RawCampaignSummary): ClientPortalCampaignSummary {
  return {
    id: raw.id,
    briefId: raw.brief_id,
    status: raw.status,
    businessDescription: raw.business_description,
    budgetUsd: raw.budget_usd,
    goals: raw.goals,
    createdAt: raw.created_at,
  }
}

function toCampaignDetail(raw: RawCampaignDetail): ClientPortalCampaignDetail {
  return {
    ...toCampaignSummary(raw),
    websiteUrl: raw.website_url,
    targetLocation: raw.target_location,
    targetAudience: raw.target_audience,
    endDate: raw.end_date,
    platforms: raw.platforms,
    googlePlan: raw.google_plan ? toGooglePlan(raw.google_plan) : null,
    metaPlan: raw.meta_plan ? toMetaPlan(raw.meta_plan) : null,
    projectedMetrics: raw.projected_metrics ? toProjectedMetrics(raw.projected_metrics) : null,
    launches: raw.launches.map(toPlatformLaunchResult),
    agencyContactEmail: raw.agency_contact_email,
  }
}

export function createHttpClientPortalApiClient({
  baseUrl,
  getAuthToken,
  fetchFn = fetch,
}: HttpClientPortalApiClientOptions): ClientPortalApiClient {
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
    return (await response.json()) as T
  }

  return {
    async listCampaigns(): Promise<ClientPortalCampaignSummary[]> {
      const raw = await request<RawCampaignSummary[]>('GET', '/portal/campaigns')
      return raw.map(toCampaignSummary)
    },

    async getCampaign(draftId: string): Promise<ClientPortalCampaignDetail> {
      return toCampaignDetail(await request<RawCampaignDetail>('GET', `/portal/campaigns/${draftId}`))
    },

    async decideCampaign(draftId: string, decision: 'approved' | 'rejected'): Promise<{ status: string }> {
      return request('POST', `/portal/campaigns/${draftId}/decision`, { decision })
    },

    async flagLaunchIssue(draftId: string): Promise<{ status: string }> {
      return request('POST', `/portal/campaigns/${draftId}/flag-issue`)
    },
  }
}
