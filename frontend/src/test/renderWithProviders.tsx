import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiClientContext } from '../lib/apiClientContext'
import type { ApiClient } from '../lib/types'

interface RenderWithProvidersOptions {
  apiClient: ApiClient
  path?: string
  initialEntries?: string[]
}

export function renderWithProviders(
  ui: ReactElement,
  { apiClient, path = '/', initialEntries = ['/'] }: RenderWithProvidersOptions,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={apiClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        </MemoryRouter>
      </ApiClientContext.Provider>
    </QueryClientProvider>,
  )
}
