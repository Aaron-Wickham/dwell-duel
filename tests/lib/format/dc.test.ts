import { describe, expect, it } from 'vitest'
import { formatDc, formatDcAmount, formatSignedDcAmount } from '@/lib/format/dc'

describe('formatDc', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [2577831, '2,577,831'],
    [-40, '−40'],
    [-2500000, '−2,500,000'],
  ])('formats %d as %s', (n, text) => {
    expect(formatDc(n)).toBe(text)
  })

  it('never shows a fraction or a negative zero', () => {
    expect(formatDc(1234.6)).toBe('1,235')
    expect(formatDc(-0)).toBe('0')
    expect(formatDc(-0.2)).toBe('0')
  })
})

describe('formatDcAmount', () => {
  it('adds the unit after a no-break space', () => {
    expect(formatDcAmount(2577831)).toBe('2,577,831\u00A0DC')
    expect(formatDcAmount(-1000)).toBe('−1,000\u00A0DC')
  })
})

describe('formatSignedDcAmount', () => {
  it('signs a change, the way the ledger shows it', () => {
    expect(formatSignedDcAmount(2500000)).toBe('+2,500,000\u00A0DC')
    expect(formatSignedDcAmount(-40)).toBe('−40\u00A0DC')
    expect(formatSignedDcAmount(0)).toBe('0\u00A0DC')
  })
})
