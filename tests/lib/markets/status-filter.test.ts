import { describe, expect, it } from 'vitest'
import { readMarketFilter } from '@/lib/markets/status-filter'

describe('readMarketFilter', () => {
  it.each(['open', 'awaiting', 'resolved'] as const)('accepts %s', (value) => {
    expect(readMarketFilter(value)).toBe(value)
  })

  it('lands the old Pending and Closed tabs’ links on Waiting and Resolved', () => {
    expect(readMarketFilter('pending')).toBe('awaiting')
    expect(readMarketFilter('closed')).toBe('resolved')
    expect(readMarketFilter(['closed', 'open'])).toBe('resolved')
  })

  it('lands the old All tab’s links on Open (#389)', () => {
    expect(readMarketFilter('all')).toBe('open')
  })

  it('falls back to Open for nothing, an unknown value or a different case', () => {
    expect(readMarketFilter(undefined)).toBe('open')
    expect(readMarketFilter('bogus')).toBe('open')
    expect(readMarketFilter('OPEN')).toBe('open')
  })

  it('uses the first of a repeated parameter', () => {
    expect(readMarketFilter(['resolved', 'open'])).toBe('resolved')
  })
})
