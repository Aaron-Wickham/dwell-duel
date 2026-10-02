const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// The wall-clock reading of `instant` in `timeZone`, as if that reading were a UTC time.
function wallClockMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
}

// The instant a wall-clock reading names in `timeZone`. The offset is looked up twice because
// the first guess can land on the other side of a DST change.
function instantOf(wallMs: number, timeZone: string): number {
  const guess = wallMs - (wallClockMs(wallMs, timeZone) - wallMs)
  return wallMs - (wallClockMs(guess, timeZone) - guess)
}

function toLocalInput(wallMs: number): string {
  return new Date(wallMs).toISOString().slice(0, 16)
}

// A duplicated weekly market's close time: the original moved forward by at least one whole week,
// and as many more as it takes to be after `now`. Weeks are added to the wall-clock time in
// `timeZone`, so a Sunday 7pm market stays Sunday 7pm across a DST change. The result is a
// datetime-local value in that zone, which is what the create form's close-time input holds.
export function nextWeeklyClose(closeAtIso: string, now: number, timeZone: string): string {
  const wall = wallClockMs(Date.parse(closeAtIso), timeZone)
  let weeks = Math.max(1, Math.floor((now - Date.parse(closeAtIso)) / WEEK_MS))
  while (instantOf(wall + weeks * WEEK_MS, timeZone) <= now) weeks++
  return toLocalInput(wall + weeks * WEEK_MS)
}

// An instant as the close-time input shows it in `timeZone`, to the minute.
export function localInputValue(iso: string, timeZone: string): string {
  return toLocalInput(wallClockMs(Date.parse(iso), timeZone))
}
