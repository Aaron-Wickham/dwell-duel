import { describe, it, expect } from 'vitest'
import { parseSlipError } from '@/lib/parlays/slip-errors'

const A = '00000000-0000-4000-8000-00000000000a'

describe('parseSlipError', () => {
  it("points a pick's error at that pick, as a sentence", () => {
    expect(parseSlipError(`pick ${A}: market is not open for betting`)).toEqual({
      pickErrors: { [A]: 'Market is not open for betting.' },
    })
  })

  it("points the parlay's error at the parlay", () => {
    expect(parseSlipError('parlay: each pick must be from a different market')).toEqual({
      parlayError: 'Each pick must be from a different market.',
    })
  })

  it('says what a pick pays now when its price moved, and asks to place again', () => {
    expect(parseSlipError(`pick ${A}: price_moved:17`)).toEqual({
      pickErrors: { [A]: 'The price moved, so this bet now pays 17 DC if it wins. Tap Place again to bet at the new price.' },
      priceMoved: true,
    })
  })

  it('says what the parlay pays now when its price moved (0104)', () => {
    expect(parseSlipError('parlay: price_moved:47')).toEqual({
      parlayError: 'The price moved, so this parlay now pays 47 DC if every pick wins. Tap Place again to bet at the new price.',
      priceMoved: true,
    })
  })

  it('shows anything else for the whole slip', () => {
    expect(parseSlipError('not invited')).toEqual({ formError: 'Not invited.' })
  })
})
