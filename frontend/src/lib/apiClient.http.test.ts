import { describe, expect, it, vi } from 'vitest'
import { createHttpApiClient } from './apiClient.http'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeClient(fetchFn: ReturnType<typeof vi.fn>) {
  return createHttpApiClient({ baseUrl: 'http://localhost:8000', getAuthToken: async () => 'token-123', fetchFn })
}

describe('createHttpApiClient', () => {
  it('getConfigStatus maps snake_case flags to camelCase', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ anthropic_configured: false, google_ads_configured: true, meta_configured: false }))
    const apiClient = makeClient(fetchFn)

    const status = await apiClient.getConfigStatus()

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/config/status',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(status).toEqual({ anthropicConfigured: false, googleAdsConfigured: true, metaConfigured: false })
  })

  it('listClients maps connection flags for each client', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'client-1',
          name: 'Acme Bakery',
          google_ads_customer_id: null,
          meta_ad_account_id: null,
          google_connected: false,
          meta_connected: false,
        },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const clients = await apiClient.listClients()

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:8000/clients', expect.objectContaining({ method: 'GET' }))
    expect(clients).toEqual([
      {
        id: 'client-1',
        name: 'Acme Bakery',
        googleAdsCustomerId: null,
        metaAdAccountId: null,
        googleConnected: false,
        metaConnected: false,
      },
    ])
  })

  it('createClient posts the name and maps the response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'client-1',
        name: 'Acme Bakery',
        google_ads_customer_id: null,
        meta_ad_account_id: null,
        google_connected: false,
        meta_connected: false,
      }),
    )
    const apiClient = makeClient(fetchFn)

    const client = await apiClient.createClient('Acme Bakery')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Acme Bakery' }) }),
    )
    expect(client.name).toBe('Acme Bakery')
  })

  it('getClient maps a null brand voice', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'client-1',
        name: 'Acme Bakery',
        google_ads_customer_id: null,
        meta_ad_account_id: null,
        google_connected: false,
        meta_connected: false,
        brand_voice: null,
      }),
    )
    const apiClient = makeClient(fetchFn)

    const client = await apiClient.getClient('client-1')

    expect(client.brandVoice).toBeNull()
  })

  it('getClient maps a present brand voice', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'client-1',
        name: 'Acme Bakery',
        google_ads_customer_id: null,
        meta_ad_account_id: null,
        google_connected: false,
        meta_connected: false,
        brand_voice: {
          id: 'bv-1',
          client_id: 'client-1',
          tone: 'friendly',
          banned_terms: ['cheap'],
          required_disclaimers: [],
          approved_offers: [],
        },
      }),
    )
    const apiClient = makeClient(fetchFn)

    const client = await apiClient.getClient('client-1')

    expect(client.brandVoice).toEqual({
      id: 'bv-1',
      clientId: 'client-1',
      tone: 'friendly',
      bannedTerms: ['cheap'],
      requiredDisclaimers: [],
      approvedOffers: [],
    })
  })

  it('setBrandVoice PUTs snake_case fields', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'bv-1',
        client_id: 'client-1',
        tone: 'friendly',
        banned_terms: ['cheap'],
        required_disclaimers: ['Results vary.'],
        approved_offers: [],
      }),
    )
    const apiClient = makeClient(fetchFn)

    await apiClient.setBrandVoice('client-1', {
      tone: 'friendly',
      bannedTerms: ['cheap'],
      requiredDisclaimers: ['Results vary.'],
      approvedOffers: [],
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/brand-voice',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          tone: 'friendly',
          banned_terms: ['cheap'],
          required_disclaimers: ['Results vary.'],
          approved_offers: [],
        }),
      }),
    )
  })

  it('connectGoogleDemo and connectMetaDemo POST to the demo-connect routes', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse({ status: 'connected', mode: 'demo' }))
    const apiClient = makeClient(fetchFn)

    await apiClient.connectGoogleDemo('client-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/google/demo-connect',
      expect.objectContaining({ method: 'POST' }),
    )

    await apiClient.connectMetaDemo('client-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/clients/client-1/meta/demo-connect',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('submitBriefsBatch posts an array of snake_case briefs and maps the drafts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'draft-1',
          brief_id: 'brief-1',
          client_id: 'client-1',
          client_name: 'Acme Bakery',
          status: 'pending_generation',
          business_description: 'Bakery',
          budget_usd: 500,
          goals: 'Traffic',
          guardrail_flag_count: 0,
          has_blocking_flags: false,
          created_at: '2026-07-09T00:00:00Z',
        },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const drafts = await apiClient.submitBriefsBatch([
      { clientId: 'client-1', businessDescription: 'Bakery', budgetUsd: 500, goals: 'Traffic' },
    ])

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/batch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          briefs: [{ client_id: 'client-1', business_description: 'Bakery', budget_usd: 500, goals: 'Traffic' }],
        }),
      }),
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ id: 'draft-1', clientName: 'Acme Bakery', status: 'pending_generation' })
  })

  it('listBriefs omits the query string when no clientId is given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]))
    const apiClient = makeClient(fetchFn)

    await apiClient.listBriefs()

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:8000/briefs', expect.objectContaining({ method: 'GET' }))
  })

  it('listBriefs includes client_id when given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]))
    const apiClient = makeClient(fetchFn)

    await apiClient.listBriefs('client-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs?client_id=client-1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('getBrief maps the full draft detail including guardrail and launches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        client_id: 'client-1',
        client_name: 'Acme Bakery',
        status: 'guardrail_checked',
        business_description: 'Bakery',
        budget_usd: 500,
        goals: 'Traffic',
        guardrail_flag_count: 1,
        has_blocking_flags: false,
        created_at: '2026-07-09T00:00:00Z',
        google_plan: {
          campaign_name: 'Austin Bakery',
          daily_budget_micros: 16_500_000,
          end_date: null,
          ad_groups: [{ name: 'Primary', keywords: ['bakery'], headlines: ['Fresh'], descriptions: ['Visit today.'] }],
        },
        meta_plan: {
          campaign_name: 'Austin Bakery',
          objective: 'traffic',
          ad_sets: [
            {
              name: 'Primary',
              daily_budget_cents: 1650,
              targeting_description: 'Adults 25-54',
              creative_headline: 'Fresh',
              creative_body: 'Visit today.',
              call_to_action: 'Visit Us Today',
            },
          ],
        },
        guardrail: { id: 'gr-1', campaign_draft_id: 'draft-1', flags: [{ severity: 'warn', code: 'x', message: 'y' }], has_blocking_flags: false },
        launches: [{ platform: 'google', status: 'success', external_campaign_id: 'g-1', error_message: null }],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const draft = await apiClient.getBrief('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(draft.googlePlan?.campaignName).toBe('Austin Bakery')
    expect(draft.metaPlan?.adSets[0].dailyBudgetCents).toBe(1650)
    expect(draft.guardrail?.flags).toEqual([{ severity: 'warn', code: 'x', message: 'y' }])
    expect(draft.launches).toEqual([
      { platform: 'google', status: 'success', externalCampaignId: 'g-1', errorMessage: null },
    ])
  })

  it('generateDraft posts and maps mode + both plans', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'draft-1',
        brief_id: 'brief-1',
        status: 'adapted',
        mode: 'demo',
        google_plan: {
          campaign_name: 'Austin Bakery',
          daily_budget_micros: 16_500_000,
          end_date: null,
          ad_groups: [],
        },
        meta_plan: { campaign_name: 'Austin Bakery', objective: 'traffic', ad_sets: [] },
      }),
    )
    const apiClient = makeClient(fetchFn)

    const result = await apiClient.generateDraft('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/generate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.mode).toBe('demo')
    expect(result.googlePlan.campaignName).toBe('Austin Bakery')
  })

  it('runGuardrails posts and maps the flag report', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'gr-1',
        campaign_draft_id: 'draft-1',
        flags: [{ severity: 'block', code: 'banned_term', message: 'Uses a banned term.' }],
        has_blocking_flags: true,
      }),
    )
    const apiClient = makeClient(fetchFn)

    const report = await apiClient.runGuardrails('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/guardrails/run',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(report.hasBlockingFlags).toBe(true)
    expect(report.flags[0]).toEqual({ severity: 'block', code: 'banned_term', message: 'Uses a banned term.' })
  })

  it('approveDraft and rejectDraft post the decision and an optional reviewer note', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse({ status: 'approved' }))
    const apiClient = makeClient(fetchFn)

    await apiClient.approveDraft('draft-1', 'Looks good')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'approved', reviewer_note: 'Looks good' }),
      }),
    )

    await apiClient.rejectDraft('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'rejected', reviewer_note: null }),
      }),
    )
  })

  it('launchDraft maps the full per-platform response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'launched',
        external_campaign_id: 'google-camp-1',
        error_message: null,
        platforms: [
          { platform: 'google', status: 'success', external_campaign_id: 'google-camp-1', error_message: null },
          { platform: 'meta', status: 'failed', external_campaign_id: null, error_message: 'Not connected' },
        ],
      }),
    )
    const apiClient = makeClient(fetchFn)

    const result = await apiClient.launchDraft('draft-1')

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/briefs/draft-1/launch',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.platforms).toEqual([
      { platform: 'google', status: 'success', externalCampaignId: 'google-camp-1', errorMessage: null },
      { platform: 'meta', status: 'failed', externalCampaignId: null, errorMessage: 'Not connected' },
    ])
  })

  it('listAuditLog defaults the limit to 100 and maps entries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'audit-1', client_id: 'client-1', event_type: 'brief.submitted', payload: { brief_id: 'brief-1' }, created_at: '2026-07-09T00:00:00Z' },
      ]),
    )
    const apiClient = makeClient(fetchFn)

    const entries = await apiClient.listAuditLog()

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:8000/audit-log?limit=100',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(entries[0]).toEqual({
      id: 'audit-1',
      clientId: 'client-1',
      eventType: 'brief.submitted',
      payload: { brief_id: 'brief-1' },
      createdAt: '2026-07-09T00:00:00Z',
    })
  })

  it('throws with the response body text when the backend returns an error status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('Client not found', { status: 404 }))
    const apiClient = makeClient(fetchFn)

    await expect(apiClient.getClient('client-1')).rejects.toThrow('Client not found')
  })
})
