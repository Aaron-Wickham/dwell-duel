import { describe, it, expect } from 'vitest'
import { localInputValue, nextWeeklyClose } from '@/lib/markets/weekly-close'

const NY = 'America/New_York'
const at = (iso: string) => Date.parse(iso)

describe('nextWeeklyClose', () => {
  it('moves a past close forward by whole weeks until it is in the future', () => {
    // Sun 6 Sep 2026, 7pm EDT; now is Mon 28 Sep.
    expect(nextWeeklyClose('2026-09-06T23:00:00Z', at('2026-09-28T12:00:00Z'), NY)).toBe('2026-10-04T19:00')
  })

  it('moves a close that is still ahead forward by one week', () => {
    expect(nextWeeklyClose('2026-10-04T23:00:00Z', at('2026-09-28T12:00:00Z'), NY)).toBe('2026-10-11T19:00')
  })

  it('skips the week whose close is exactly now', () => {
    expect(nextWeeklyClose('2026-09-20T23:00:00Z', at('2026-09-27T23:00:00Z'), NY)).toBe('2026-10-04T19:00')
  })

  it('keeps the local time across the spring-forward change', () => {
    // Sun 1 Mar 2026, 7pm EST (00:00Z); clocks go forward on 8 Mar.
    expect(nextWeeklyClose('2026-03-02T00:00:00Z', at('2026-03-05T12:00:00Z'), NY)).toBe('2026-03-08T19:00')
    expect(nextWeeklyClose('2026-03-02T00:00:00Z', at('2026-03-10T12:00:00Z'), NY)).toBe('2026-03-15T19:00')
  })

  it('keeps the local time across the fall-back change', () => {
    // Sun 25 Oct 2026, 7pm EDT (23:00Z); clocks go back on 1 Nov.
    expect(nextWeeklyClose('2026-10-25T23:00:00Z', at('2026-10-27T12:00:00Z'), NY)).toBe('2026-11-01T19:00')
  })

  it('decides "in the future" by the local close instant, not the old UTC offset', () => {
    // 7pm EDT on 25 Oct is 23:00Z; a week later 7pm EST is 00:00Z on 2 Nov. At 23:30Z on 1 Nov
    // the old offset would call it past, but 7pm EST is still half an hour away.
    expect(nextWeeklyClose('2026-10-25T23:00:00Z', at('2026-11-01T23:30:00Z'), NY)).toBe('2026-11-01T19:00')
    expect(nextWeeklyClose('2026-10-25T23:00:00Z', at('2026-11-02T00:00:00Z'), NY)).toBe('2026-11-08T19:00')
  })

  it('works in UTC too', () => {
    expect(nextWeeklyClose('2026-09-06T23:00:00Z', at('2026-09-28T12:00:00Z'), 'UTC')).toBe('2026-10-04T23:00')
  })
})

describe('localInputValue', () => {
  it('reads an instant as a datetime-local value in the zone, dropping the seconds', () => {
    expect(localInputValue('2026-10-04T23:00:42Z', NY)).toBe('2026-10-04T19:00')
    expect(localInputValue('2026-12-04T23:00:00Z', NY)).toBe('2026-12-04T18:00')
    expect(localInputValue('2026-10-04T23:00:00Z', 'UTC')).toBe('2026-10-04T23:00')
  })
})
