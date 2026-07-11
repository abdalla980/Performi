import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createHttpApiClient } from './apiClient.http'
import { useAuth } from './authContext'
import type { ApiClient } from './types'

export const ApiClientContext = createContext<ApiClient | null>(null)

export function ApiClientProvider({ children }: { children: ReactNode }) {
  const { getAuthToken } = useAuth()

  const apiClient = useMemo(
    () => createHttpApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL, getAuthToken }),
    [getAuthToken],
  )

  return <ApiClientContext.Provider value={apiClient}>{children}</ApiClientContext.Provider>
}

export function useApiClient(): ApiClient {
  const context = useContext(ApiClientContext)
  if (!context) {
    throw new Error('useApiClient must be used within an ApiClientProvider')
  }
  return context
}
