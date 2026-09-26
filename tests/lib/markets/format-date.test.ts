import { describe, it, expect } from 'vitest'
import { formatDateTime, formatDay } from '@/lib/markets/format-date'

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
