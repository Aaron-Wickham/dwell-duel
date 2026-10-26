import { describe, it, expect } from 'vitest'
import { formatCloseTime, formatDateTime, formatDay } from '@/lib/markets/format-date'

describe('formatDateTime', () => {
  it('formats a close time as weekday, date and time', () => {
    expect(formatDateTime('2026-10-04T14:00:00Z', 'America/Chicago')).toMatch(/^Sun, Oct 4 · 9:00\sAM$/)
  })

  it('uses the given time zone, even across midnight', () => {
    expect(formatDateTime('2026-10-05T03:30:00Z', 'America/Chicago')).toMatch(/^Sun, Oct 4 · 10:30\sPM$/)
    expect(formatDateTime('2026-10-05T03:30:00Z', 'UTC')).toMatch(/^Mon, Oct 5 · 3:30\sAM$/)
  })
})

describe('formatDay', () => {
  it('formats just the month and day', () => {
    expect(formatDay('2026-09-21T15:00:00Z', 'UTC')).toBe('Sep 21')
  })
})

// HOME-3: "Closes Oct 28", or within 24 hours the time, saying "tomorrow" when it's tomorrow's.
describe('formatCloseTime', () => {
  const now = Date.parse('2026-10-04T12:00:00Z')

  it('gives the day when the close is more than 24 hours away', () => {
    expect(formatCloseTime('2026-10-28T18:00:00Z', now, 'UTC')).toBe('Oct 28')
  })

  it('gives the time, without :00 on the hour, later the same day', () => {
    expect(formatCloseTime('2026-10-04T18:00:00Z', now, 'UTC')).toMatch(/^6\sPM$/)
    expect(formatCloseTime('2026-10-04T18:30:00Z', now, 'UTC')).toMatch(/^6:30\sPM$/)
  })

  it('says tomorrow for a time within 24 hours on the next day', () => {
    expect(formatCloseTime('2026-10-05T09:30:00Z', now, 'UTC')).toMatch(/^tomorrow 9:30\sAM$/)
  })

  it('judges the day in the viewer’s time zone', () => {
    // 01:00 UTC on the 5th is still the evening of the 4th in Chicago.
    expect(formatCloseTime('2026-10-05T01:00:00Z', now, 'America/Chicago')).toMatch(/^8\sPM$/)
    expect(formatCloseTime('2026-10-05T01:00:00Z', now, 'UTC')).toMatch(/^tomorrow 1\sAM$/)
  })

  it('falls back to the day once the close has passed', () => {
    expect(formatCloseTime('2026-10-04T11:00:00Z', now, 'UTC')).toBe('Oct 4')
  })
})
