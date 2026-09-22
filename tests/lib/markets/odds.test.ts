import { describe, it, expect } from 'vitest'
import { computeOdds } from '@/lib/markets/odds'

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
