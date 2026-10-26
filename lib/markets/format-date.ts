export function formatDateTime(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(date)
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date)
  return `${day} · ${time}`
}

export function formatDay(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(iso))
}

const DAY_MS = 24 * 60 * 60 * 1000

function hourText(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).formatToParts(date)
  const onTheHour = parts.find((part) => part.type === 'minute')?.value === '00'
  return onTheHour ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone }).format(date) : parts.map((part) => part.value).join('')
}

// The viewer's calendar date as a UTC midnight, so two dates subtract to a whole number of days
// whatever the clocks did in between (a 23- or 25-hour day around a DST change).
function localDay(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date)
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)!.value)
  return Date.UTC(part('year'), part('month') - 1, part('day'))
}

// When a market closes, for the word after "Closes" (HOME-3): the day ("Oct 28"), or within 24 hours
// the time ("6 PM", "6:30 PM") when it's today's, with "tomorrow" when it's the next calendar day's,
// so "6 PM" never reads as today's when it's tomorrow's. Across a short DST day 24 hours can reach
// the day after tomorrow, which gets the day instead.
export function formatCloseTime(iso: string, now: number, timeZone?: string): string {
  const date = new Date(iso)
  const ahead = date.getTime() - now
  if (ahead <= 0 || ahead > DAY_MS) return formatDay(iso, timeZone)
  const days = Math.round((localDay(date, timeZone) - localDay(new Date(now), timeZone)) / DAY_MS)
  if (days === 0) return hourText(date, timeZone)
  if (days === 1) return `tomorrow ${hourText(date, timeZone)}`
  return formatDay(iso, timeZone)
}
