import { describe, it, expect } from 'vitest'
import { easternDay, recapWeekFor, weekRangeLabel } from '@/lib/home/recap-week'

const at = (iso: string) => new Date(iso)

describe('easternDay', () => {
  it('reads the calendar day in New York, not UTC', () => {
    // 02:00Z on Monday 28 September is 22:00 EDT on Sunday the 27th.
    expect(easternDay(at('2026-09-28T02:00:00Z'))).toEqual({ date: '2026-09-27', weekday: 0 })
    expect(easternDay(at('2026-09-28T04:00:00Z'))).toEqual({ date: '2026-09-28', weekday: 1 })
  })
})

describe('recapWeekFor', () => {
  it('recaps the week so far on Sunday, and the same week, finished, on Monday', () => {
    expect(recapWeekFor(at('2026-09-27T16:00:00Z'))).toEqual({ mode: 'so-far', monday: '2026-09-21', sunday: '2026-09-27' })
    expect(recapWeekFor(at('2026-09-28T16:00:00Z'))).toEqual({ mode: 'last', monday: '2026-09-21', sunday: '2026-09-27' })
  })

  it('shows nothing Tuesday to Saturday', () => {
    for (const day of ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']) {
      expect(recapWeekFor(at(`${day}T16:00:00Z`))).toBeNull()
    }
  })

  it('turns over at midnight Eastern: Sunday 23:59 is still Sunday, Monday 00:00 is Monday', () => {
    // EDT is UTC−4.
    expect(recapWeekFor(at('2026-09-28T03:59:00Z'))?.mode).toBe('so-far')
    expect(recapWeekFor(at('2026-09-28T04:00:00Z'))?.mode).toBe('last')
    // Saturday 23:59 EDT shows nothing; Sunday 00:00 starts the recap.
    expect(recapWeekFor(at('2026-09-27T03:59:00Z'))).toBeNull()
    expect(recapWeekFor(at('2026-09-27T04:00:00Z'))?.mode).toBe('so-far')
    // Tuesday 00:00 EDT ends it.
    expect(recapWeekFor(at('2026-09-29T03:59:00Z'))?.mode).toBe('last')
    expect(recapWeekFor(at('2026-09-29T04:00:00Z'))).toBeNull()
  })

  it('follows the clocks going forward in March', () => {
    // Clocks go forward at 02:00 on Sunday 8 March 2026. Saturday 23:59 is still EST (UTC−5).
    expect(recapWeekFor(at('2026-03-08T04:59:00Z'))).toBeNull()
    expect(recapWeekFor(at('2026-03-08T05:00:00Z'))).toEqual({ mode: 'so-far', monday: '2026-03-02', sunday: '2026-03-08' })
    // By Sunday night it's EDT (UTC−4), so Monday starts an hour earlier in UTC.
    expect(recapWeekFor(at('2026-03-09T03:59:00Z'))?.mode).toBe('so-far')
    expect(recapWeekFor(at('2026-03-09T04:00:00Z'))).toEqual({ mode: 'last', monday: '2026-03-02', sunday: '2026-03-08' })
  })

  it('follows the clocks going back in November', () => {
    // Clocks go back at 02:00 on Sunday 1 November 2026. Sunday starts in EDT (UTC−4)...
    expect(recapWeekFor(at('2026-11-01T03:59:00Z'))).toBeNull()
    expect(recapWeekFor(at('2026-11-01T04:00:00Z'))).toEqual({ mode: 'so-far', monday: '2026-10-26', sunday: '2026-11-01' })
    // ...and ends in EST (UTC−5): 04:00Z is 23:00 on Sunday, not midnight.
    expect(recapWeekFor(at('2026-11-02T04:00:00Z'))?.mode).toBe('so-far')
    expect(recapWeekFor(at('2026-11-02T04:59:00Z'))?.mode).toBe('so-far')
    expect(recapWeekFor(at('2026-11-02T05:00:00Z'))).toEqual({ mode: 'last', monday: '2026-10-26', sunday: '2026-11-01' })
  })

  it('crosses months and years', () => {
    expect(recapWeekFor(at('2026-10-05T16:00:00Z'))).toEqual({ mode: 'last', monday: '2026-09-28', sunday: '2026-10-04' })
    expect(recapWeekFor(at('2027-01-04T16:00:00Z'))).toEqual({ mode: 'last', monday: '2026-12-28', sunday: '2027-01-03' })
  })
})

describe('weekRangeLabel', () => {
  it('names the month once inside a month, and both across two', () => {
    expect(weekRangeLabel({ monday: '2026-09-21', sunday: '2026-09-27' })).toBe('Sep 21–27')
    expect(weekRangeLabel({ monday: '2026-09-28', sunday: '2026-10-04' })).toBe('Sep 28 – Oct 4')
    expect(weekRangeLabel({ monday: '2026-12-28', sunday: '2027-01-03' })).toBe('Dec 28 – Jan 3')
  })
})
