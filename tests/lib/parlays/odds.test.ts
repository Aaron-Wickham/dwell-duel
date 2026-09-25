import { describe, it, expect } from 'vitest'
import { legOdds, combineOdds, potentialPayout } from '@/lib/parlays/odds'

describe('legOdds', () => {
  it('divides the total pool by the outcome pool', () => {
    expect(legOdds(20, 5)).toBe(4)
  })

  it('returns null for an outcome nobody has bet on', () => {
    expect(legOdds(20, 0)).toBeNull()
  })
})

describe('combineOdds', () => {
  it('multiplies leg odds', () => {
    expect(combineOdds([4, 2])).toEqual({ multiplier: 8, capped: false })
  })

  it('caps the product at 20x', () => {
    expect(combineOdds([4, 4, 4])).toEqual({ multiplier: 20, capped: true })
  })

  it('treats no legs as 1x', () => {
    expect(combineOdds([])).toEqual({ multiplier: 1, capped: false })
  })
})

describe('potentialPayout', () => {
  it('rounds down', () => {
    expect(potentialPayout(10, 16 / 9)).toBe(17)
  })

  it('is exact when the result is whole', () => {
    expect(potentialPayout(5, 16)).toBe(80)
  })
})
