const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

// "Closes in 2h" for a market closing within a day, or null. Whole minutes and hours round down,
// like the feed's "2h ago", so the label never promises more time than is left.
export function closesInLabel(closeAt: string, now: number): string | null {
  const ms = Date.parse(closeAt) - now
  if (!(ms > 0) || ms > DAY_MS) return null
  const minutes = Math.floor(ms / MINUTE_MS)
  if (minutes < 1) return 'Closes in under a minute'
  if (minutes < 60) return `Closes in ${minutes}m`
  return `Closes in ${Math.floor(minutes / 60)}h`
}
