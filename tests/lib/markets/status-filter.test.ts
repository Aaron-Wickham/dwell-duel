import { describe, expect, it } from 'vitest'
import { readMarketFilter } from '@/lib/markets/status-filter'

describe('readMarketFilter', () => {
  it.each(['open', 'pending', 'closed', 'all'] as const)('accepts %s', (value) => {
    expect(readMarketFilter(value)).toBe(value)
  })

  it('falls back to all for nothing, an unknown value or a different case', () => {
    expect(readMarketFilter(undefined)).toBe('all')
    expect(readMarketFilter('bogus')).toBe('all')
    expect(readMarketFilter('OPEN')).toBe('all')
  })

  it('uses the first of a repeated parameter', () => {
    expect(readMarketFilter(['closed', 'open'])).toBe('closed')
  })
})
