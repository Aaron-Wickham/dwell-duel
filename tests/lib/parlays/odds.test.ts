import { describe, it, expect } from 'vitest'
import { legOddsBp, lockedOddsToBp, combineOdds, potentialPayout, formatOdds, factorBp, fixedParlay, lmsrParlayQuote } from '@/lib/parlays/odds'
import { lmsrBuy } from '@/lib/markets/lmsr'

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
    expect(combineOdds([40_000, 40_000])).toEqual({ multiplierBp: 160_000, capped: false })
    expect(combineOdds([40_000, 40_000, 40_000])).toEqual({ multiplierBp: 200_000, capped: true })
  })

  it('caps a parlay placed before 0074 at its own 100x', () => {
    expect(combineOdds([40_000, 40_000, 40_000], 100)).toEqual({ multiplierBp: 640_000, capped: false })
    expect(combineOdds([40_000, 40_000, 40_000, 40_000], 100)).toEqual({ multiplierBp: 1_000_000, capped: true })
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
    expect(potentialPayout(10, [40_000, 40_000])).toBe(160)
    expect(potentialPayout(10, [40_000, 40_000, 40_000])).toBe(200)
  })

  it('pays at most 1,000 DC, or the stake if a parlay placed before the cap staked more', () => {
    expect(potentialPayout(60, [40_000, 40_000, 40_000])).toBe(1000)
    expect(potentialPayout(10, [40_000, 40_000, 40_000], 100)).toBe(640)
    expect(potentialPayout(30, [60_000, 60_000], 100)).toBe(1000)
    expect(potentialPayout(1500, [20_000, 20_000], 100)).toBe(1500)
  })
})

describe('formatOdds', () => {
  it('shows two decimals, truncating', () => {
    expect(formatOdds(160_000)).toBe('16.00')
    expect(formatOdds(33_300)).toBe('3.33')
    expect(formatOdds(99_999)).toBe('9.99')
  })
})

describe('fixed parlays (0104)', () => {
  it('reads a stored factor or multiplier in 1/10,000ths, truncated, from a number or a string', () => {
    expect(factorBp(5.24)).toBe(52_400)
    expect(factorBp('1.999999')).toBe(19_999)
    expect(factorBp('2')).toBe(20_000)
    expect(factorBp('5.2400000000001')).toBe(52_400)
  })

  it('multiplies six-place factors exactly and pays floor(stake x product)', () => {
    // 1.832161 x 2.5 = 4.5804025: 10 DC pays 45, not 46.
    expect(fixedParlay(10, ['1.832161', 2.5])).toEqual({ multiplierBp: 45_804, payout: 45 })
    expect(fixedParlay(7, [2, 2])).toEqual({ multiplierBp: 40_000, payout: 28 })
    expect(fixedParlay(7, [])).toEqual({ multiplierBp: 10_000, payout: 7 })
  })

  it('quotes what place_lmsr_parlay stores: S/n a leg, six-place shares and factors, never under 1x', () => {
    const even = { q: [0, 0], liquidity: 50, index: 0 }
    const stake = 10
    const shares = Math.floor(lmsrBuy([0, 0], 50, 0, 5) * 1e6)
    const factor = Math.floor((shares * 2) / stake)
    const quote = lmsrParlayQuote([even, even], stake)
    expect(quote.factors).toEqual([factor / 1e6, factor / 1e6])
    expect(quote).toMatchObject(fixedParlay(stake, [factor / 1e6, factor / 1e6]))
    // A sure thing buys back about its spend: the factor floors at 1.
    const sure = { q: [5000, 0], liquidity: 50, index: 0 }
    expect(lmsrParlayQuote([sure, sure, sure], 10).factors).toEqual([1, 1, 1])
  })
})
