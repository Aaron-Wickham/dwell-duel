import { describe, it, expect } from 'vitest'
import { legOddsBp, lockedOddsToBp, combineOdds, potentialPayout, formatOdds, soloPayout } from '@/lib/parlays/odds'

describe('legOddsBp', () => {
  it('is total / outcome pool in 1/10,000ths, truncated like place_parlay', () => {
    expect(legOddsBp(20, 5)).toBe(40_000)
    expect(legOddsBp(10, 3)).toBe(33_333)
  })

  it('returns null for an outcome nobody has bet on', () => {
    expect(legOddsBp(20, 0)).toBeNull()
  })
})

describe('lockedOddsToBp', () => {
  it('converts a stored 4-decimal locked_odds value to basis points', () => {
    expect(lockedOddsToBp('3.3333')).toBe(33_333)
    expect(lockedOddsToBp(4)).toBe(40_000)
  })
})

describe('combineOdds', () => {
  it('multiplies leg odds exactly', () => {
    expect(combineOdds([40_000, 20_000])).toEqual({ multiplierBp: 80_000, capped: false })
    expect(combineOdds([33_333, 30_000])).toEqual({ multiplierBp: 99_999, capped: false })
  })

  it('caps the product at 20x', () => {
    expect(combineOdds([40_000, 40_000, 40_000])).toEqual({ multiplierBp: 200_000, capped: true })
  })

  it('treats no legs as 1x', () => {
    expect(combineOdds([])).toEqual({ multiplierBp: 10_000, capped: false })
  })
})

describe('potentialPayout', () => {
  it('matches settle_parlay where floating-point math would not', () => {
    expect(potentialPayout(10, [33_333, 30_000])).toBe(99)
    expect(potentialPayout(100, [11_500, 20_000])).toBe(230)
  })

  it('rounds down', () => {
    expect(potentialPayout(10, [13_333, 13_333])).toBe(17)
  })

  it('caps at 20x the stake', () => {
    expect(potentialPayout(10, [40_000, 40_000, 40_000])).toBe(200)
  })
})

describe('formatOdds', () => {
  it('shows two decimals, truncating', () => {
    expect(formatOdds(160_000)).toBe('16.00')
    expect(formatOdds(33_300)).toBe('3.33')
    expect(formatOdds(99_999)).toBe('9.99')
  })
})

describe('soloPayout', () => {
  it('counts the stake in both pools, as resolve_market will', () => {
    // 10 on an outcome holding 5 of a 20 pool: floor(10 × 30 / 15) = 20.
    expect(soloPayout(10, 5, 20)).toBe(20)
  })

  it('returns the stake on an outcome nobody else has bet on in an empty market', () => {
    expect(soloPayout(10, 0, 0)).toBe(10)
  })

  it('rounds down', () => {
    expect(soloPayout(3, 5, 20)).toBe(Math.floor((3 * 23) / 8))
  })
})
