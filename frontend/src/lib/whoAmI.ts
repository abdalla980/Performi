import type { WhoAmI } from './types'

interface FetchWhoAmIOptions {
  baseUrl: string
  token: string
  fetchFn?: typeof fetch
}

export async function fetchWhoAmI({ baseUrl, token, fetchFn = fetch }: FetchWhoAmIOptions): Promise<WhoAmI> {
  const response = await fetchFn(`${baseUrl}/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return (await response.json()) as WhoAmI
}
