import { describe, it, expect } from 'vitest'
import { lmsrQuote } from '@/lib/markets/pricing'
import { EXAMPLE_STAKE, soloPays } from '@/lib/parlays/solo-pays'

// The market page's "10 DC wins 16" and the slip's "Pays 16 DC if it wins" both come from here
// (#390), so they're the same number by construction: what place_lmsr_bet stores for the stake.
describe('soloPays', () => {
  it('pays what lmsrQuote says place_lmsr_bet pays, for every outcome and stake', () => {
    for (const q of [[0, 0], [40, 0], [0, 120], [12.5, 3, 80]]) {
      for (let index = 0; index < q.length; index++) {
        for (const stake of [1, 5, EXAMPLE_STAKE, 25, 333]) {
          expect(soloPays({ q, index, liquidity: 50 }, stake)).toBe(lmsrQuote(q, 50, index, stake).payout)
        }
      }
    }
  })

  it('quotes 10 DC, one of the slip’s quick stakes', () => {
    expect(EXAMPLE_STAKE).toBe(10)
    expect(soloPays({ q: [0, 0], index: 0, liquidity: 50 }, EXAMPLE_STAKE)).toBe(18)
  })

  it('quotes nothing on a pool market, which takes no bets', () => {
    expect(soloPays(undefined, EXAMPLE_STAKE)).toBeNull()
  })
})
