import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewClientPage } from './NewClientPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'

describe('NewClientPage', () => {
  it('creates a client from the name field', async () => {
    const createClient = vi.fn().mockResolvedValue({
      id: 'client-1',
      name: 'Acme Bakery',
      googleAdsCustomerId: null,
      metaAdAccountId: null,
      googleConnected: false,
      metaConnected: false,
    })
    const apiClient = createFakeApiClient({ createClient })

    renderWithProviders(<NewClientPage />, { apiClient })

    await userEvent.type(screen.getByLabelText('Client name'), 'Acme Bakery')
    await userEvent.click(screen.getByRole('button', { name: /create client/i }))

    await waitFor(() => expect(createClient).toHaveBeenCalledWith('Acme Bakery'))
  })

  it('disables submit until a name is entered', () => {
    const apiClient = createFakeApiClient()
    renderWithProviders(<NewClientPage />, { apiClient })

    expect(screen.getByRole('button', { name: /create client/i })).toBeDisabled()
  })
})
