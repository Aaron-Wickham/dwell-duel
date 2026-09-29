// Seasons are calendar months in America/New_York (0051), the same clock settle_season uses.
const SEASON_TIME_ZONE = 'America/New_York'

export function signedDc(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : ''
  return `${sign}${Math.abs(amount)} DC`
}

// The month a season_champion event's id names: `season:YYYY-MM`.
export function seasonOfEventId(id: string): string | null {
  return /^season:(\d{4}-\d{2})$/.exec(id)?.[1] ?? null
}

// "October" for '2026-10', with the year only when it isn't the current one ("December 2025").
export function seasonName(season: string, now: Date = new Date()): string {
  const [year, month] = season.split('-').map(Number)
  // Mid-month at noon UTC is the same month in every time zone, so the formatter can't slip.
  const date = new Date(Date.UTC(year, month - 1, 15, 12))
  const name = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
  return year === currentSeasonYear(now) ? name : `${name} ${year}`
}

export function currentSeasonName(now: Date = new Date()): string {
  return now.toLocaleString('en-US', { month: 'long', timeZone: SEASON_TIME_ZONE })
}

function currentSeasonYear(now: Date): number {
  return Number(now.toLocaleString('en-US', { year: 'numeric', timeZone: SEASON_TIME_ZONE }))
}
