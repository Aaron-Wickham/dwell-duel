import { describe, it, expect } from 'vitest'
import { chartTitle, orderOutcomes, outcomeSeries, plottedOutcomes } from '@/lib/markets/outcome-series'

describe('outcomeSeries', () => {
  it('always colours a yes/no market the same way, whatever order the outcomes arrive in', () => {
    expect(outcomeSeries('binary', 'Yes', 0)).toBe(2)
    expect(outcomeSeries('binary', 'No', 1)).toBe(1)
    expect(outcomeSeries('binary', 'Yes', 1)).toBe(2)
    expect(outcomeSeries('binary', 'No', 0)).toBe(1)
  })

  it('makes Over the green and Under the ink, as a yes/no market’s Yes and No', () => {
    expect(outcomeSeries('over_under', 'Over 3.5', 1)).toBe(2)
    expect(outcomeSeries('over_under', 'Under 3.5', 0)).toBe(1)
  })

  it('gives multiple-choice outcomes the five hues from the green, then the grey line', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => outcomeSeries('multiple_choice', `Option ${i}`, i))).toEqual([2, 3, 4, 5, 1, 6])
  })
})

describe('plottedOutcomes', () => {
  const yesNo = [{ label: 'No' }, { label: 'Yes' }]

  it('draws only Yes for a yes/no market, and only Over for an over/under', () => {
    expect(plottedOutcomes('binary', yesNo)).toEqual([{ label: 'Yes' }])
    expect(plottedOutcomes('over_under', [{ label: 'Under 2.5' }, { label: 'Over 2.5' }])).toEqual([{ label: 'Over 2.5' }])
  })

  it('draws every multiple-choice outcome', () => {
    const three = [{ label: 'A' }, { label: 'B' }, { label: 'C' }]
    expect(plottedOutcomes('multiple_choice', three)).toEqual(three)
  })
})

describe('orderOutcomes', () => {
  it('puts Yes before No and Over before Under (#389)', () => {
    expect(orderOutcomes('binary', [{ label: 'No' }, { label: 'Yes' }]).map((o) => o.label)).toEqual(['Yes', 'No'])
    expect(orderOutcomes('over_under', [{ label: 'Over 1.5' }, { label: 'Under 1.5' }]).map((o) => o.label)).toEqual(['Over 1.5', 'Under 1.5'])
  })

  it('keeps a multiple-choice market’s order as read', () => {
    expect(orderOutcomes('multiple_choice', [{ label: 'Ruth' }, { label: 'Eli' }]).map((o) => o.label)).toEqual(['Ruth', 'Eli'])
  })
})

describe('chartTitle', () => {
  it('names a two-outcome chart for the one line it draws (#390)', () => {
    expect(chartTitle('binary', [{ label: 'No' }, { label: 'Yes' }])).toBe('Yes over time')
    expect(chartTitle('over_under', [{ label: 'Over 42.5' }, { label: 'Under 42.5' }])).toBe('Over 42.5 over time')
  })

  it('calls a multiple-choice chart Chance over time', () => {
    expect(chartTitle('multiple_choice', [{ label: 'Ruth' }, { label: 'Eli' }])).toBe('Chance over time')
  })
})
