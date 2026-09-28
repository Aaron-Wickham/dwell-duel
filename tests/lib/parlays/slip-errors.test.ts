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

  it('shows anything else for the whole slip', () => {
    expect(parseSlipError('not invited')).toEqual({ formError: 'Not invited.' })
  })
})
