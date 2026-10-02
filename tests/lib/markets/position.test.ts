import { describe, it, expect } from 'vitest'
import { legSummary, positionSummary, type PositionBet, type PositionLeg } from '@/lib/markets/position'
import type { ParlayLegView, ParlayView } from '@/lib/parlays/list-parlays'

const bet = (amount: number, result: PositionBet['result']): PositionBet => ({
  id: amount,
  outcomeLabel: 'Yes',
  amount,
  placedAt: '2026-10-03T09:14:00Z',
  result,
  paysIfWins: null,
})

describe('positionSummary', () => {
  it('says nothing for a viewer with only parlay legs here', () => {
    expect(positionSummary([])).toBeNull()
  })

  it('totals the solo stakes while the market is open, and says bets are final', () => {
    expect(positionSummary([bet(20, { kind: 'open' }), bet(10, { kind: 'open' })])).toEqual({
      tone: 'plain',
      text: '30 DC on this market · Bets are final.',
    })
  })

  it('waits on the result once the market has closed', () => {
    expect(positionSummary([bet(20, { kind: 'awaiting' })])?.text).toBe('20 DC on this market · Waiting on the result.')
  })

  it('nets what was won against what was lost once settled', () => {
    expect(positionSummary([bet(20, { kind: 'won', payout: 36 }), bet(10, { kind: 'lost' })])).toEqual({
      tone: 'win',
      text: 'You won 6 DC on this market.',
    })
    expect(positionSummary([bet(20, { kind: 'won', payout: 26 }), bet(10, { kind: 'lost' })])).toEqual({
      tone: 'loss',
      text: 'You lost 4 DC on this market.',
    })
  })

  it('hides the line when the net is 0', () => {
    expect(positionSummary([bet(20, { kind: 'won', payout: 30 }), bet(10, { kind: 'lost' })])).toBeNull()
  })

  it('says the bets were refunded when every one was', () => {
    expect(positionSummary([bet(20, { kind: 'refunded', reason: 'voided' })])?.text).toBe('Your bet was refunded.')
    expect(
      positionSummary([bet(20, { kind: 'refunded', reason: 'no_winners' }), bet(5, { kind: 'refunded', reason: 'no_winners' })])?.text,
    ).toBe('Your bets were refunded.')
  })
})

const leg = (marketId: string, status: ParlayLegView['status'], oddsKnown = false): ParlayLegView => ({
  marketId,
  marketTitle: marketId,
  outcomeLabel: 'Yes',
  oddsBp: 20_000,
  oddsKnown,
  status,
})

function position(overrides: Partial<ParlayView>, here: ParlayLegView, others: ParlayLegView[]): PositionLeg {
  const parlay: ParlayView = {
    id: 'p1',
    stake: 5,
    status: 'pending',
    credited: 0,
    maxMultiplier: 20,
    lockedAtPlacement: false,
    converted: false,
    fixed: false,
    multiplierBp: 160_000,
    capped: false,
    estimated: true,
    potentialPayout: 80,
    createdAt: '2026-10-03T09:00:00Z',
    legs: [here, ...others],
    ...overrides,
  }
  return { parlay, leg: here }
}

describe('legSummary', () => {
  it('describes the parlay while its leg here is open, and says when the odds are set', () => {
    expect(legSummary(position({}, leg('m', 'open'), [leg('a', 'open'), leg('b', 'open')]))).toBe(
      '5 DC · 3 picks · pays ~80 DC if every pick wins. Leg odds are set when this market closes.',
    )
  })

  it('drops the odds note once they are set', () => {
    expect(legSummary(position({ estimated: false }, leg('m', 'awaiting', true), [leg('a', 'open', true)]))).toBe(
      '5 DC · 2 picks · pays 80 DC if every pick wins.',
    )
  })

  it('says how many picks the parlay still waits on after its leg here won', () => {
    expect(legSummary(position({}, leg('m', 'won', true), [leg('a', 'open'), leg('b', 'awaiting')]))).toBe(
      'Your leg won. The parlay waits on 2 more picks.',
    )
    expect(legSummary(position({}, leg('m', 'won', true), [leg('a', 'open'), leg('b', 'won', true)]))).toBe(
      'Your leg won. The parlay waits on 1 more pick.',
    )
  })

  it('says a voided leg drops out', () => {
    expect(legSummary(position({}, leg('m', 'voided'), [leg('a', 'open')]))).toBe('Leg voided; the parlay continues without it.')
  })

  it('gives the parlay’s own result once it has settled', () => {
    expect(legSummary(position({ status: 'won', credited: 80 }, leg('m', 'won', true), [leg('a', 'won', true)]))).toBe('Parlay won 80 DC')
    expect(legSummary(position({ status: 'lost' }, leg('m', 'won', true), [leg('a', 'lost', true)]))).toBe('Parlay lost')
    expect(legSummary(position({ status: 'refunded' }, leg('m', 'voided'), [leg('a', 'voided')]))).toBe('Parlay refunded')
  })
})
