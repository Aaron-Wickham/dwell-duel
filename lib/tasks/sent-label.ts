// When a submission waiting for review was sent, as Tasks says it (#394): "today", a weekday within
// the last week ("Thu"), then a date ("Sep 22"). Days are calendar days in the viewer's time zone.
export function sentLabel(iso: string, now: number, timeZone?: string): string {
  const days = calendarDay(Date.parse(iso), timeZone) - calendarDay(now, timeZone)
  if (days === 0) return 'today'
  if (days > -7 && days < 0) return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(new Date(iso))
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(iso))
}

// Days since the epoch of the calendar date `ms` falls on in `timeZone`.
function calendarDay(ms: number, timeZone?: string): number {
  const ymd = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(ms))
  return Date.parse(`${ymd}T00:00:00Z`) / 86_400_000
}
