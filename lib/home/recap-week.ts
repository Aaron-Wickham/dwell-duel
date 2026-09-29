// The group lives on Eastern time, so the recap's days are America/New_York's, whatever zone the
// server or the member is in. weekly_recap (0056) turns a week's Monday into instants the same way.
const RECAP_TIME_ZONE = 'America/New_York'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Sunday recaps the week so far; Monday recaps the same week, now finished. Both name its Monday
// and Sunday as YYYY-MM-DD calendar dates in Eastern time.
export type RecapWeek = { mode: 'so-far' | 'last'; monday: string; sunday: string }

export function easternDay(now: Date): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RECAP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, weekday: WEEKDAYS.indexOf(part('weekday')) }
}

// Calendar arithmetic on a date with no time zone, so a DST change can't shift the day.
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The week Home recaps at `now`, or null on the days it shows nothing.
export function recapWeekFor(now: Date): RecapWeek | null {
  const { date, weekday } = easternDay(now)
  if (weekday === 0) return { mode: 'so-far', monday: addDays(date, -6), sunday: date }
  if (weekday === 1) return { mode: 'last', monday: addDays(date, -7), sunday: addDays(date, -1) }
  return null
}

// "Sep 21–27", or "Sep 28 – Oct 4" when the week spans two months.
export function weekRangeLabel(week: Pick<RecapWeek, 'monday' | 'sunday'>): string {
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T12:00:00Z`).toLocaleString('en-US', { ...options, timeZone: 'UTC' })
  const start = format(week.monday, { month: 'short', day: 'numeric' })
  if (week.monday.slice(0, 7) === week.sunday.slice(0, 7)) return `${start}–${format(week.sunday, { day: 'numeric' })}`
  return `${start} – ${format(week.sunday, { month: 'short', day: 'numeric' })}`
}
