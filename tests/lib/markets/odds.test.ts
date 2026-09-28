import { describe, it, expect } from 'vitest'
import { computeOdds, effectivePools } from '@/lib/markets/odds'

describe('computeOdds', () => {
  it('computes implied probability from pool totals', () => {
    const result = computeOdds([
      { id: 'a', label: 'Yes', pool_total: 30 },
      { id: 'b', label: 'No', pool_total: 70 },
    ])
    expect(result).toEqual([
      { outcomeId: 'a', label: 'Yes', poolTotal: 30, impliedProbability: 0.3 },
      { outcomeId: 'b', label: 'No', poolTotal: 70, impliedProbability: 0.7 },
    ])
  })

  it('returns null probability for every outcome when nothing has been bet', () => {
    const result = computeOdds([
      { id: 'a', label: 'Yes', pool_total: 0 },
      { id: 'b', label: 'No', pool_total: 0 },
    ])
    expect(result.every((o) => o.impliedProbability === null)).toBe(true)
  })
})

describe('computeOdds with a seed', () => {
  it('gives every outcome an even chance before any bet', () => {
    const odds = computeOdds(
      [
        { id: 'y', label: 'Yes', pool_total: 0 },
        { id: 'n', label: 'No', pool_total: 0 },
      ],
      20,
    )
    expect(odds.map((o) => o.impliedProbability)).toEqual([0.5, 0.5])
  })

  it('moves gradually with one-sided betting instead of jumping to 100%', () => {
    const odds = computeOdds(
      [
        { id: 'y', label: 'Yes', pool_total: 10 },
        { id: 'n', label: 'No', pool_total: 0 },
      ],
      20,
    )
    expect(odds.map((o) => o.impliedProbability)).toEqual([0.6, 0.4])
  })
})

describe('effectivePools', () => {
  it('adds the seed to the outcome and one seed per outcome to the total', () => {
    expect(effectivePools(10, 40, 20, 3)).toEqual({ pool: 30, total: 100 })
  })
})
