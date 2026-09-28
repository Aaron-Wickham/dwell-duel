import { describe, it, expect } from 'vitest'
import { outcomeSeries } from '@/lib/markets/outcome-series'

describe('outcomeSeries', () => {
  it('always colours a yes/no market the same way, whatever order the outcomes arrive in', () => {
    expect(outcomeSeries('binary', 'Yes', 0)).toBe(2)
    expect(outcomeSeries('binary', 'No', 1)).toBe(1)
    expect(outcomeSeries('binary', 'Yes', 1)).toBe(2)
    expect(outcomeSeries('binary', 'No', 0)).toBe(1)
  })

  it('gives multiple-choice outcomes the series in order', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => outcomeSeries('multiple_choice', `Option ${i}`, i))).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('wraps past the sixth series rather than running out', () => {
    expect(outcomeSeries('multiple_choice', 'Seventh', 6)).toBe(1)
  })
})

describe('outcomeSeries for over/under', () => {
  it('makes Over blue and Under gold, whatever the order', () => {
    expect(outcomeSeries('over_under', 'Over 3.5', 1)).toBe(4)
    expect(outcomeSeries('over_under', 'Under 3.5', 0)).toBe(3)
  })
})
