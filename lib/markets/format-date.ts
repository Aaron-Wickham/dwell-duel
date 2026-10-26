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

function localDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(date)
}

// When a market closes, for the word after "Closes" (HOME-3): the day ("Oct 28"), or within 24 hours
// the time ("6 PM", "6:30 PM"), with "tomorrow" when that time is on the next day, so "6 PM" never
// reads as today's when it's tomorrow's.
export function formatCloseTime(iso: string, now: number, timeZone?: string): string {
  const date = new Date(iso)
  const ahead = date.getTime() - now
  if (ahead <= 0 || ahead > DAY_MS) return formatDay(iso, timeZone)
  const time = hourText(date, timeZone)
  return localDate(date, timeZone) === localDate(new Date(now), timeZone) ? time : `tomorrow ${time}`
}
