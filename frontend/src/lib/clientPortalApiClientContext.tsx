import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createHttpClientPortalApiClient } from './clientPortalApiClient.http'
import { useAuth } from './authContext'
import type { ClientPortalApiClient } from './types'

export const ClientPortalApiClientContext = createContext<ClientPortalApiClient | null>(null)

export function ClientPortalApiClientProvider({ children }: { children: ReactNode }) {
  const { getAuthToken } = useAuth()

  const apiClient = useMemo(
    () => createHttpClientPortalApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL, getAuthToken }),
    [getAuthToken],
  )

  return <ClientPortalApiClientContext.Provider value={apiClient}>{children}</ClientPortalApiClientContext.Provider>
}

export function useClientPortalApiClient(): ClientPortalApiClient {
  const context = useContext(ClientPortalApiClientContext)
  if (!context) {
    throw new Error('useClientPortalApiClient must be used within a ClientPortalApiClientProvider')
  }
  return context
}
