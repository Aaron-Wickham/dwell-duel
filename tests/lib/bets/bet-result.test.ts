import { describe, it, expect } from 'vitest'
import { betResult } from '@/lib/bets/list-my-bets'

const NOW = Date.parse('2026-09-29T12:00:00.000Z')

function market(overrides: Partial<Parameters<typeof betResult>[1]> = {}): Parameters<typeof betResult>[1] {
  return {
    status: 'resolved',
    close_at: '2026-09-28T12:00:00.000Z',
    current_resolution: { outcome_id: 'o-no', payout_seed: 0 },
    market_outcomes: [
      { id: 'o-yes', pool_total: 10 },
      { id: 'o-no', pool_total: 0 },
    ],
    ...overrides,
  }
}

describe('betResult', () => {
  it('is refunded for no winners when the winning outcome has no stakes, whichever side was picked (#193)', () => {
    expect(betResult({ outcomeId: 'o-yes', amount: 10 }, market(), NOW)).toEqual({ kind: 'refunded', reason: 'no_winners' })
    expect(betResult({ outcomeId: 'o-no', amount: 10 }, market(), NOW)).toEqual({ kind: 'refunded', reason: 'no_winners' })
  })

  it('is lost when someone else backed the winner', () => {
    const m = market({
      market_outcomes: [
        { id: 'o-yes', pool_total: 10 },
        { id: 'o-no', pool_total: 5 },
      ],
    })
    expect(betResult({ outcomeId: 'o-yes', amount: 10 }, m, NOW)).toEqual({ kind: 'lost' })
    // The real pool: floor(5 × 15 / 5) = 15.
    expect(betResult({ outcomeId: 'o-no', amount: 5 }, m, NOW)).toEqual({ kind: 'won', payout: 15 })
  })

  it('reads a resolution from before 0074 with the seed its payouts counted', () => {
    const m = market({
      current_resolution: { outcome_id: 'o-no', payout_seed: 20 },
      market_outcomes: [
        { id: 'o-yes', pool_total: 10 },
        { id: 'o-no', pool_total: 5 },
      ],
    })
    // floor(5 × (15 + 2 × 20) / (5 + 20)) = 11
    expect(betResult({ outcomeId: 'o-no', amount: 5 }, m, NOW)).toEqual({ kind: 'won', payout: 11 })
  })

  it('pays a lone winner their stake back', () => {
    const m = market({ market_outcomes: [{ id: 'o-yes', pool_total: 0 }, { id: 'o-no', pool_total: 10 }] })
    expect(betResult({ outcomeId: 'o-no', amount: 10 }, m, NOW)).toEqual({ kind: 'won', payout: 10 })
  })

  it('says a void refunded it, apart from a no-winners refund', () => {
    expect(betResult({ outcomeId: 'o-yes', amount: 10 }, market({ status: 'voided' }), NOW)).toEqual({ kind: 'refunded', reason: 'voided' })
  })

  it('is open until the close time, then awaiting', () => {
    const m = market({ status: 'open', current_resolution: null })
    expect(betResult({ outcomeId: 'o-yes', amount: 10 }, { ...m, close_at: '2026-09-30T12:00:00.000Z' }, NOW)).toEqual({ kind: 'open' })
    expect(betResult({ outcomeId: 'o-yes', amount: 10 }, m, NOW)).toEqual({ kind: 'awaiting' })
  })
})
