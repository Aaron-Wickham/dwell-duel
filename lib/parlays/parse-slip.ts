import { MAX_PICKS } from './odds'

export const SLIP_COOKIE = 'parlay_slip'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseSlip(raw: string | undefined): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const outcomeIds = parsed.filter((v): v is string => typeof v === 'string' && UUID.test(v))
  return [...new Set(outcomeIds)].slice(0, MAX_PICKS)
}
