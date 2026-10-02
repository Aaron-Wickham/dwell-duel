import { describe, it, expect } from 'vitest'
import { DEFAULT_LIQUIDITY, lmsrBuy, lmsrCost, lmsrPrices } from '@/lib/markets/lmsr'

describe('lmsr', () => {
  it('opens every outcome at an even price', () => {
    expect(lmsrPrices([0, 0], 50)).toEqual([0.5, 0.5])
    lmsrPrices([0, 0, 0, 0], 50).forEach((p) => expect(p).toBeCloseTo(0.25, 12))
  })

  it('matches the spec worked example at b = 100', () => {
    const alice = lmsrBuy([0, 0], 100, 0, 20)
    expect(alice).toBeCloseTo(36.6586, 3)
    expect(lmsrPrices([alice, 0], 100)[0]).toBeCloseTo(0.5906, 3)
    expect(lmsrBuy([alice, 0], 100, 0, 20)).toBeCloseTo(31.835, 2)
  })

  it('moves a fresh 50/50 market to about 59% on a 10 DC bet at the default liquidity', () => {
    expect(DEFAULT_LIQUIDITY).toBe(50)
    const s = lmsrBuy([0, 0], DEFAULT_LIQUIDITY, 0, 10)
    expect(s).toBeCloseTo(18.329, 2)
    expect(lmsrPrices([s, 0], DEFAULT_LIQUIDITY)[0]).toBeCloseTo(0.5906, 3)
  })

  it('charges exactly the spend: cost after minus cost before', () => {
    const q = [12.5, 3, 40]
    const s = lmsrBuy(q, 50, 1, 25)
    expect(lmsrCost([12.5, 3 + s, 40], 50) - lmsrCost(q, 50)).toBeCloseTo(25, 9)
  })

  it('stays finite with share counts far beyond exp overflow', () => {
    const q = [100_000, 0]
    expect(Number.isFinite(lmsrCost(q, 50))).toBe(true)
    expect(lmsrPrices(q, 50)[0]).toBeCloseTo(1, 12)
    expect(lmsrBuy(q, 50, 1, 10)).toBeGreaterThanOrEqual(10)
  })

  it('never returns fewer shares than DC spent, even buying the heavy favourite', () => {
    expect(lmsrBuy([3000, 0], 50, 0, 3)).toBeGreaterThanOrEqual(3)
    for (let lead = 500; lead <= 5000; lead += 500) {
      for (let spend = 1; spend <= 50; spend += 7) {
        for (const outcome of [0, 1]) {
          expect(lmsrBuy([lead, 0], 50, outcome, spend), `lead ${lead} spend ${spend} outcome ${outcome}`).toBeGreaterThanOrEqual(spend)
        }
      }
    }
  })

  it('buys nothing for nothing', () => {
    expect(lmsrBuy([5, 9], 50, 0, 0)).toBeCloseTo(0, 12)
  })

  it('refuses bad input', () => {
    expect(() => lmsrPrices([], 50)).toThrow(RangeError)
    expect(() => lmsrCost([0, 0], 0)).toThrow(RangeError)
    expect(() => lmsrBuy([0, 0], 50, 2, 10)).toThrow(RangeError)
    expect(() => lmsrBuy([0, 0], 50, 0, -1)).toThrow(RangeError)
  })
})
