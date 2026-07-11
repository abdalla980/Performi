import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClientPortalApiClientContext } from '../lib/clientPortalApiClientContext'
import type { ClientPortalApiClient } from '../lib/types'

interface RenderWithClientPortalProvidersOptions {
  apiClient: ClientPortalApiClient
  path?: string
  initialEntries?: string[]
}

export function renderWithClientPortalProviders(
  ui: ReactElement,
  { apiClient, path = '/', initialEntries = ['/'] }: RenderWithClientPortalProvidersOptions,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ClientPortalApiClientContext.Provider value={apiClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        </MemoryRouter>
      </ClientPortalApiClientContext.Provider>
    </QueryClientProvider>,
  )
}
