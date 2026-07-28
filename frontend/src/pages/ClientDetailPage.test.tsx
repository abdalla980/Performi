import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClientDetailPage } from './ClientDetailPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { ClientDetail, DraftSummary } from '../lib/types'

describe('ClientDetailPage', () => {
  it('saves brand voice and connects Google in demo mode', async () => {
    let client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }

    const getClient = vi.fn(async () => client)
    const setBrandVoice = vi.fn(async (_clientId: string, input) => {
      client = { ...client, brandVoice: { id: 'bv-1', clientId: 'client-1', ...input } }
      return client.brandVoice!
    })
    const connectGoogleDemo = vi.fn(async () => {
      client = { ...client, googleConnected: true, googleAdsCustomerId: 'demo-client-1' }
    })
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      getClient,
      setBrandVoice,
      connectGoogleDemo,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: false }),
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')

    await userEvent.type(screen.getByLabelText('Tone'), 'friendly')
    await userEvent.type(screen.getByLabelText(/Banned terms/i), 'cheap, discount')
    await userEvent.click(screen.getByRole('button', { name: /save brand voice/i }))

    await waitFor(() =>
      expect(setBrandVoice).toHaveBeenCalledWith('client-1', {
        tone: 'friendly',
        bannedTerms: ['cheap', 'discount'],
        requiredDisclaimers: [],
        approvedOffers: [],
        sitelinks: [],
      }),
    )

    const [connectGoogleButton] = screen.getAllByRole('button', { name: /connect \(demo\)/i })
    await userEvent.click(connectGoogleButton)

    await waitFor(() => expect(connectGoogleDemo).toHaveBeenCalledWith('client-1'))
  })

  it('saves pasted Google and Meta account IDs', async () => {
    let client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }

    const getClient = vi.fn(async () => client)
    const setGoogleAdAccount = vi.fn(async (_clientId: string, customerId: string) => {
      client = { ...client, googleAdsCustomerId: customerId, googleConnected: true }
      return client
    })
    const setMetaAdAccount = vi.fn(async (_clientId: string, adAccountId: string) => {
      client = { ...client, metaAdAccountId: adAccountId, metaConnected: true }
      return client
    })
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      getClient,
      setGoogleAdAccount,
      setMetaAdAccount,
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')

    await userEvent.type(screen.getByLabelText('Google Ads customer ID'), '123-456-7890')
    await userEvent.click(screen.getByRole('button', { name: 'Save Google Ads customer ID' }))
    await waitFor(() => expect(setGoogleAdAccount).toHaveBeenCalledWith('client-1', '123-456-7890'))

    await userEvent.type(screen.getByLabelText('Meta ad account ID'), 'act_999')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meta ad account ID' }))
    await waitFor(() => expect(setMetaAdAccount).toHaveBeenCalledWith('client-1', 'act_999'))
  })

  it('uploads a logo and shows it once uploaded', async () => {
    let client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }
    const uploadClientAsset = vi.fn(async (_clientId: string, kind: 'logo' | 'image', file: File) => {
      const asset = { id: 'asset-1', kind, filename: file.name, url: '/uploads/client-1/abc.png', createdAt: '2026-07-18T00:00:00Z' }
      client = { ...client, assets: [...client.assets, asset] }
      return asset
    })
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      getClient: async () => client,
      uploadClientAsset,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: false }),
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')
    const file = new File(['fake-bytes'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(/^logo$/i), file)

    await waitFor(() => expect(uploadClientAsset).toHaveBeenCalledWith('client-1', 'logo', file))
    expect(await screen.findByAltText('logo.png')).toBeInTheDocument()
  })

  it('deletes an asset', async () => {
    let client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [{ id: 'asset-1', kind: 'logo', filename: 'logo.png', url: '/uploads/client-1/abc.png', createdAt: '2026-07-18T00:00:00Z' }],
    }
    const deleteClientAsset = vi.fn(async () => {
      client = { ...client, assets: [] }
    })
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      getClient: async () => client,
      deleteClientAsset,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: false }),
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByAltText('logo.png')
    await userEvent.click(screen.getByRole('button', { name: /remove logo.png/i }))

    await waitFor(() => expect(deleteClientAsset).toHaveBeenCalledWith('client-1', 'asset-1'))
    await waitFor(() => expect(screen.queryByAltText('logo.png')).not.toBeInTheDocument())
  })

  it('shows a success message after saving brand voice', async () => {
    const client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      getClient: async () => client,
      setBrandVoice: async (_clientId, input) => ({ id: 'bv-1', clientId: 'client-1', ...input }),
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: false }),
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')
    expect(screen.queryByText(/brand voice saved/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /save brand voice/i }))

    expect(await screen.findByText(/brand voice saved/i)).toBeInTheDocument()
  })

  it('deletes the client after confirming, and not when cancelled', async () => {
    const client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }
    const deleteClient = vi.fn(async () => {})
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      getClient: async () => client,
      deleteClient,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: false }),
    })
    const confirmSpy = vi.spyOn(window, 'confirm')

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')

    confirmSpy.mockReturnValueOnce(false)
    await userEvent.click(screen.getByRole('button', { name: /delete client/i }))
    expect(deleteClient).not.toHaveBeenCalled()

    confirmSpy.mockReturnValueOnce(true)
    await userEvent.click(screen.getByRole('button', { name: /delete client/i }))
    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('client-1', { force: false }))

    confirmSpy.mockRestore()
  })

  it('shows a launched-campaign warning panel instead of confirm when deleting', async () => {
    const client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: 'act_111',
      googleConnected: false,
      metaConnected: true,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }
    const deleteClient = vi.fn(async () => {})
    const apiClient = createFakeApiClient({
      listBriefs: async () => [
        {
          id: 'draft-1',
          briefId: 'brief-1',
          clientId: 'client-1',
          clientName: 'Acme Bakery',
          clientLogoUrl: null,
          platforms: ['meta'],
          status: 'launched',
          businessDescription: 'Bakery summer promo',
          budgetUsd: 500,
          goals: 'Traffic',
          guardrailFlagCount: 0,
          hasBlockingFlags: false,
          createdAt: '2026-07-09T00:00:00Z',
          launches: [],
        },
      ],
      getClient: async () => client,
      deleteClient,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: true }),
    })
    const confirmSpy = vi.spyOn(window, 'confirm')

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')
    await userEvent.click(screen.getByRole('button', { name: /delete client/i }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByText(/still marked launched/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage in meta ads manager/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /delete anyway/i }))
    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('client-1', { force: true }))

    confirmSpy.mockRestore()
  })

  it('shows campaign stats and a recent campaigns list for this client', async () => {
    const client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      logoUrl: null,
      brandVoice: null,
      assets: [],
    }
    const briefs: DraftSummary[] = [
      {
        id: 'draft-1',
        briefId: 'brief-1',
        clientId: 'client-1',
        clientName: 'Acme Bakery',
        clientLogoUrl: null,
        platforms: ['google'],
        status: 'launched',
        businessDescription: 'Spring promo',
        budgetUsd: 500,
        goals: 'Traffic',
        guardrailFlagCount: 0,
        hasBlockingFlags: false,
        createdAt: '2026-07-09T00:00:00Z',
        launches: [],
      },
      {
        id: 'draft-2',
        briefId: 'brief-2',
        clientId: 'client-1',
        clientName: 'Acme Bakery',
        clientLogoUrl: null,
        platforms: ['meta'],
        status: 'adapted',
        businessDescription: 'Summer promo',
        budgetUsd: 300,
        goals: 'Leads',
        guardrailFlagCount: 0,
        hasBlockingFlags: false,
        createdAt: '2026-07-10T00:00:00Z',
        launches: [],
      },
    ]
    const apiClient = createFakeApiClient({
      getClient: async () => client,
      listBriefs: async () => briefs,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: false, metaConfigured: false }),
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    const stats = await screen.findByRole('region', { name: /client campaign summary/i })
    expect(within(stats).getByText('2')).toBeInTheDocument() // total campaigns
    expect(within(stats).getByText('1')).toBeInTheDocument() // launched

    expect(screen.getByRole('link', { name: /summer promo/i })).toHaveAttribute('href', '/campaigns/draft-2')
    expect(screen.getByRole('link', { name: /spring promo/i })).toHaveAttribute('href', '/campaigns/draft-1')
  })
})
