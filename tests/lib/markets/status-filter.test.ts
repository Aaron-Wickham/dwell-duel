import { describe, expect, it } from 'vitest'
import { readMarketFilter } from '@/lib/markets/status-filter'

describe('readMarketFilter', () => {
  it.each(['open', 'awaiting', 'resolved', 'all'] as const)('accepts %s', (value) => {
    expect(readMarketFilter(value)).toBe(value)
  })

  it('lands the old Pending and Closed tabs’ links on Awaiting and Resolved', () => {
    expect(readMarketFilter('pending')).toBe('awaiting')
    expect(readMarketFilter('closed')).toBe('resolved')
    expect(readMarketFilter(['closed', 'open'])).toBe('resolved')
  })

  it('falls back to all for nothing, an unknown value or a different case', () => {
    expect(readMarketFilter(undefined)).toBe('all')
    expect(readMarketFilter('bogus')).toBe('all')
    expect(readMarketFilter('OPEN')).toBe('all')
  })

  it('uses the first of a repeated parameter', () => {
    expect(readMarketFilter(['resolved', 'open'])).toBe('resolved')
  })
})
