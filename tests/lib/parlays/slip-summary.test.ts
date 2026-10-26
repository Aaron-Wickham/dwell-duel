import { describe, it, expect } from 'vitest'
import { slipErrorSummary } from '@/lib/parlays/slip-summary'

describe('slipErrorSummary (MKT-3)', () => {
  it('says nothing when nothing was refused', () => {
    expect(slipErrorSummary({ picks: 0, parlay: false, priceMoved: false })).toBeNull()
  })

  it('counts moved prices, singular and plural', () => {
    expect(slipErrorSummary({ picks: 1, parlay: false, priceMoved: true })).toBe('1 pick’s price moved. Check it above, then tap Place again.')
    expect(slipErrorSummary({ picks: 2, parlay: false, priceMoved: true })).toBe('2 picks’ prices moved. Check them above, then tap Place again.')
    expect(slipErrorSummary({ picks: 0, parlay: true, priceMoved: true })).toBe('The parlay’s price moved. Check it above, then tap Place again.')
    expect(slipErrorSummary({ picks: 1, parlay: true, priceMoved: true })).toBe(
      '1 pick’s and the parlay’s prices moved. Check them above, then tap Place again.',
    )
  })

  it('points at any other refusal without promising a new price', () => {
    expect(slipErrorSummary({ picks: 1, parlay: false, priceMoved: false })).toBe('1 pick needs a change. Check it above.')
    expect(slipErrorSummary({ picks: 3, parlay: false, priceMoved: false })).toBe('3 picks need a change. Check them above.')
    expect(slipErrorSummary({ picks: 0, parlay: true, priceMoved: false })).toBe('The parlay needs a change. Check it above.')
    expect(slipErrorSummary({ picks: 2, parlay: true, priceMoved: false })).toBe('2 picks and the parlay need a change. Check them above.')
  })
})
