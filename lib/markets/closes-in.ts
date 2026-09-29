const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// "Closes in 2h" for a market closing within a day, or null. Rounded to the nearest minute or
// hour, since flooring made 1h 59m read as "1h", and under a minute it never says "0m".
export function closesInLabel(closeAt: string, now: number): string | null {
  const ms = Date.parse(closeAt) - now
  if (!(ms > 0) || ms > DAY_MS) return null
  if (ms < MINUTE_MS) return 'Closes in under a minute'
  const minutes = Math.round(ms / MINUTE_MS)
  if (minutes < 60) return `Closes in ${minutes}m`
  return `Closes in ${Math.round(ms / HOUR_MS)}h`
}
