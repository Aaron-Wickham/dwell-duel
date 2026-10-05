import { describe, it, expect } from 'vitest'
import { parseSlipError } from '@/lib/parlays/slip-errors'

const A = '00000000-0000-4000-8000-00000000000a'

describe('parseSlipError', () => {
  it("points a pick's error at that pick, in words that say what to do", () => {
    expect(parseSlipError(`pick ${A}: market is not open for betting`)).toEqual({
      pickErrors: { [A]: 'This market has closed. Remove it from your slip to place the rest.' },
    })
  })

  it("points the parlay's error at the parlay", () => {
    expect(parseSlipError('parlay: each pick must be from a different market')).toEqual({
      parlayError: 'Each pick must be from a different market. Remove one of them, or switch it to Solo.',
    })
  })

  it('keeps a refusal the SQL wrote for members, naming the market', () => {
    expect(parseSlipError("parlay: 'Will it rain?' is no longer open")).toEqual({
      parlayError: "'Will it rain?' is no longer open. Remove it from your slip to place the rest.",
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

  it('shows a slip-wide refusal for the whole slip', () => {
    expect(parseSlipError('not invited')).toEqual({
      formError: 'This account isn’t on the invite list. Sign in with the account you were invited with.',
    })
  })

  it('never passes unknown database text to a member, and hands it to the caller to log', () => {
    const logged: string[] = []
    expect(parseSlipError(`pick ${A}: column "x" does not exist`, (raw) => logged.push(raw))).toEqual({
      pickErrors: { [A]: 'Something went wrong. Try again.' },
    })
    expect(logged).toEqual(['column "x" does not exist'])
  })
})
