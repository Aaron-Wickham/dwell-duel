import { describe, it, expect } from 'vitest'
import { sentLabel } from '@/lib/tasks/sent-label'

// Sun Oct 4, 2026, 18:00 UTC.
const NOW = Date.parse('2026-10-04T18:00:00Z')

describe('sentLabel', () => {
  it('says today for the same calendar day', () => {
    expect(sentLabel('2026-10-04T01:00:00Z', NOW, 'UTC')).toBe('today')
  })

  it('names the weekday within the last week', () => {
    expect(sentLabel('2026-10-01T12:00:00Z', NOW, 'UTC')).toBe('Thu')
    expect(sentLabel('2026-09-28T12:00:00Z', NOW, 'UTC')).toBe('Mon')
  })

  it('gives a date once it is a week or more ago', () => {
    expect(sentLabel('2026-09-27T12:00:00Z', NOW, 'UTC')).toBe('Sep 27')
  })

  it('counts calendar days in the viewer’s time zone', () => {
    // 02:00 UTC on Oct 4 is still Oct 3 in New York.
    expect(sentLabel('2026-10-04T02:00:00Z', NOW, 'America/New_York')).toBe('Sat')
  })
})
