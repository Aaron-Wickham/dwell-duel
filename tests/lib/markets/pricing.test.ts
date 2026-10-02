import { describe, it, expect } from 'vitest'
import { lmsrOddsBp, lmsrQuote, lmsrState, marketOdds, type PricedMarket } from '@/lib/markets/pricing'

const outcome = (id: string, poolTotal: number, shares = 0, qOffset = 0) => ({ id, label: id, poolTotal, shares, qOffset })

describe('marketOdds', () => {
  it('reads the LMSR price on an lmsr market, opening at even prices', () => {
    const market: PricedMarket = { pricing: 'lmsr', liquidity: 50, seedPerOutcome: 0, outcomes: [outcome('Yes', 0), outcome('No', 0)] }
    expect(marketOdds(market).map((o) => o.impliedProbability)).toEqual([0.5, 0.5])
  })

  it('moves an lmsr market to about 59% after the spec’s 10 DC bet, whatever the DC staked', () => {
    const market: PricedMarket = {
      pricing: 'lmsr',
      liquidity: 50,
      seedPerOutcome: 0,
      outcomes: [outcome('Yes', 10, 18.329474), outcome('No', 0)],
    }
    const [yes, no] = marketOdds(market)
    expect(yes.impliedProbability).toBeCloseTo(0.5906, 4)
    expect(no.impliedProbability).toBeCloseTo(0.4094, 4)
    expect(yes.poolTotal).toBe(10)
  })

  it('counts each outcome’s q_offset', () => {
    expect(lmsrState([{ shares: 2, qOffset: 3 }, { shares: 0, qOffset: 0 }])).toEqual([5, 0])
  })

  it('keeps the seeded pools on a pool market', () => {
    const market: PricedMarket = { pricing: 'pool', liquidity: 50, seedPerOutcome: 20, outcomes: [outcome('Yes', 10), outcome('No', 30)] }
    expect(marketOdds(market).map((o) => o.impliedProbability)).toEqual([0.375, 0.625])
  })
})

describe('lmsrQuote', () => {
  it('pays the spec’s worked example: 10 DC buys 18.329474 shares, paying 18 DC', () => {
    expect(lmsrQuote([0, 0], 50, 0, 10)).toEqual({ shares: 18.329474, payout: 18 })
  })
})

describe('lmsrOddsBp', () => {
  it('is what a DC pays at the price, rounded down', () => {
    expect(lmsrOddsBp(0.5)).toBe(20_000)
    expect(lmsrOddsBp(0.3)).toBe(33_333)
    expect(lmsrOddsBp(null)).toBeNull()
  })
})
