import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClientDetailPage } from './ClientDetailPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { ClientDetail } from '../lib/types'

describe('ClientDetailPage', () => {
  it('saves brand voice and connects Google in demo mode', async () => {
    let client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      brandVoice: null,
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
      }),
    )

    const [connectGoogleButton] = screen.getAllByRole('button', { name: /connect \(demo\)/i })
    await userEvent.click(connectGoogleButton)

    await waitFor(() => expect(connectGoogleDemo).toHaveBeenCalledWith('client-1'))
  })

  it('navigates to the real OAuth URL when the platform is configured', async () => {
    const client: ClientDetail = {
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
      brandVoice: null,
    }
    const assignMock = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign: assignMock } })

    const getGoogleOAuthUrl = vi.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?state=client-1')
    const apiClient = createFakeApiClient({
      getClient: async () => client,
      getGoogleOAuthUrl,
      getConfigStatus: async () => ({ anthropicConfigured: false, googleAdsConfigured: true, metaConfigured: false }),
    })

    renderWithProviders(<ClientDetailPage />, {
      apiClient,
      path: '/clients/:clientId',
      initialEntries: ['/clients/client-1'],
    })

    await screen.findByText('Acme Bakery')
    await userEvent.click(await screen.findByRole('button', { name: /connect \(live\)/i }))

    await waitFor(() => expect(getGoogleOAuthUrl).toHaveBeenCalledWith('client-1'))
    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=client-1'),
    )

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })
})
