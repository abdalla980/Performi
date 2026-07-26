import type { WhoAmI } from './types'

interface FetchWhoAmIOptions {
  baseUrl: string
  token: string
  fetchFn?: typeof fetch
}

interface RawWhoAmI {
  role: WhoAmI['role']
  id: string
  name: string
  agency_name: string | null
}

export async function fetchWhoAmI({ baseUrl, token, fetchFn = fetch }: FetchWhoAmIOptions): Promise<WhoAmI> {
  const response = await fetchFn(`${baseUrl}/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const raw = (await response.json()) as RawWhoAmI
  return { role: raw.role, id: raw.id, name: raw.name, agencyName: raw.agency_name }
}
