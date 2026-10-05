import { describe, expect, it } from 'vitest'
import { fakeSupabase } from '../fake-supabase'
import { getParlayDetail, legTally, tallySummary, toParlayDetail } from '@/lib/parlays/get-parlay'

const ID = '0b9c3f5e-8a1d-4c2b-9e7f-000000000001'

function leg(over: Record<string, unknown> = {}, market: Record<string, unknown> = {}) {
  return {
    outcome_id: 'o-yes',
    locked_odds: 2.1,
    factor: null,
    market_outcomes: { label: 'Yes' },
    markets: {
      id: 'm-1',
      title: 'Will it rain?',
      status: 'open',
      close_at: '2026-10-01T12:00:00Z',
      market_outcomes: [
        { id: 'o-yes', label: 'Yes' },
        { id: 'o-no', label: 'No' },
      ],
      current_resolution: null,
      ...market,
    },
    ...over,
  }
}

const row = (legs: unknown[], over: Record<string, unknown> = {}) =>
  ({ id: ID, profile_id: 'u-1', stake: 5, status: 'pending', credited: 0, max_multiplier: 20, multiplier: null, payout: null, created_at: '2026-09-27T16:10:00Z', parlay_legs: legs, ...over }) as Parameters<
    typeof toParlayDetail
  >[0]

const BEFORE_CLOSE = Date.parse('2026-09-29T12:00:00Z')

describe('toParlayDetail', () => {
  it('multiplies the set odds and reads each leg’s state from its market', () => {
    const detail = toParlayDetail(
      row([
        leg({}, { status: 'resolved', current_resolution: { outcome_id: 'o-yes', resolved_at: '2026-09-29T10:00:00Z' } }),
        leg({ locked_odds: 2 }, { id: 'm-2', title: 'Other?' }),
      ]),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    expect(detail.ownerName).toBe('Grace')
    expect(detail.multiplierBp).toBe(42_000)
    expect(detail.potentialPayout).toBe(21)
    expect(detail.legs.map((l) => l.status)).toEqual(['won', 'open'])
    expect(detail.legs[0]).toMatchObject({ winningLabel: 'Yes', resolvedAt: '2026-09-29T10:00:00Z', marketStatus: 'resolved' })
    expect(detail.legs[1]).toMatchObject({ winningLabel: null, closeAt: '2026-10-01T12:00:00Z' })
  })

  it('leaves a voided leg out of the multiplier, as settle_parlay does', () => {
    const detail = toParlayDetail(row([leg({}, { status: 'voided' }), leg({ locked_odds: 2 }, { id: 'm-2' })]), 'Grace', BEFORE_CLOSE, new Map())
    expect(detail.legs[0].status).toBe('voided')
    expect(detail.multiplierBp).toBe(20_000)
    expect(detail.potentialPayout).toBe(10)
  })

  it('marks a leg on the wrong side of a resolution as lost', () => {
    const detail = toParlayDetail(
      row([leg({}, { status: 'resolved', current_resolution: { outcome_id: 'o-no', resolved_at: '2026-09-29T10:00:00Z' } })]),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    expect(detail.legs[0]).toMatchObject({ status: 'lost', winningLabel: 'No' })
  })

  it('estimates a leg whose odds aren’t set yet from its quote, and says the multiplier is an estimate', () => {
    const detail = toParlayDetail(
      row([leg({ locked_odds: null }), leg({ locked_odds: 2 }, { id: 'm-2' })]),
      'Grace',
      BEFORE_CLOSE,
      new Map([[`${ID}:o-yes`, { oddsBp: 30_000, known: false }]]),
    )
    expect(detail.legs.map((l) => [l.oddsBp, l.oddsKnown])).toEqual([
      [30_000, false],
      [20_000, true],
    ])
    expect(detail).toMatchObject({ multiplierBp: 60_000, estimated: true, potentialPayout: 30 })
  })

  it('caps a parlay placed before 0074 at its own 100x', () => {
    const detail = toParlayDetail(
      row([leg({ locked_odds: 6 }), leg({ locked_odds: 6 }, { id: 'm-2' }), leg({ locked_odds: 6 }, { id: 'm-3' })], { max_multiplier: 100 }),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    expect(detail).toMatchObject({ maxMultiplier: 100, multiplierBp: 1_000_000, capped: true, estimated: false, potentialPayout: 500 })
  })

  it('marks an unresolved leg past its market’s close time as awaiting', () => {
    const detail = toParlayDetail(row([leg()]), 'Grace', Date.parse('2026-10-01T12:00:01Z'), new Map())
    expect(detail.legs[0].status).toBe('awaiting')
  })
})

describe('a fixed parlay (0104)', () => {
  it('shows its factors as known odds and its stored payout, uncapped', () => {
    const detail = toParlayDetail(
      row(
        [leg({ locked_odds: null, factor: '3.1' }), leg({ locked_odds: null, factor: 2.5 }, { id: 'm-2' })],
        { stake: 10, multiplier: '7.75', payout: 77, max_multiplier: 8 },
      ),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    expect(detail).toMatchObject({ fixed: true, multiplierBp: 77_500, capped: false, estimated: false, potentialPayout: 77 })
    expect(detail.legs.map((l) => [l.oddsBp, l.oddsKnown])).toEqual([
      [31_000, true],
      [25_000, true],
    ])
  })

  it('drops a voided leg and pays the stake times the factors left', () => {
    const detail = toParlayDetail(
      row(
        [leg({ locked_odds: null, factor: '3.1' }, { status: 'voided' }), leg({ locked_odds: null, factor: '2.5' }, { id: 'm-2' })],
        { stake: 10, multiplier: '7.75', payout: 77 },
      ),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    expect(detail).toMatchObject({ multiplierBp: 25_000, potentialPayout: 25 })
  })
})

describe('a pool parlay converted at release (0105)', () => {
  it('shows its stored payout as exact, capped as the pool rules capped it', () => {
    const detail = toParlayDetail(
      row(
        [leg({ locked_odds: 5, factor: 5 }), leg({ locked_odds: 5, factor: 5 }, { id: 'm-2' }), leg({ locked_odds: 3.3333, factor: 3.3333 }, { id: 'm-3' })],
        { stake: 40, multiplier: 20, payout: 800, converted: true },
      ),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    expect(detail).toMatchObject({ fixed: true, multiplierBp: 200_000, capped: true, estimated: false, potentialPayout: 800 })
  })

  it('keeps the caps when a leg is voided', () => {
    const detail = toParlayDetail(
      row(
        [leg({ locked_odds: 5, factor: 5 }), leg({ locked_odds: 5, factor: 5 }, { id: 'm-2' }), leg({ locked_odds: 3.3333, factor: 3.3333 }, { id: 'm-3', status: 'voided' })],
        { stake: 40, multiplier: 20, payout: 800, converted: true },
      ),
      'Grace',
      BEFORE_CLOSE,
      new Map(),
    )
    // 25x, capped at 20x: 800, where an uncapped fixed parlay would show 1,000.
    expect(detail).toMatchObject({ multiplierBp: 200_000, capped: true, potentialPayout: 800 })
  })
})

describe('getParlayDetail', () => {
  it('returns null without a query for an id that isn’t a uuid', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: null }))
    expect(await getParlayDetail(client, 'nope')).toBeNull()
    expect(queries).toHaveLength(0)
  })

  it('returns null when RLS shows the member nothing', async () => {
    const { client } = fakeSupabase(() => ({ data: null }))
    expect(await getParlayDetail(client, ID)).toBeNull()
  })

  it('reads the parlay and its owner’s name', async () => {
    const { client, queries } = fakeSupabase((q) =>
      q.table === 'parlays' ? { data: row([leg()]) } : { data: { display_name: 'Grace' } },
    )
    const detail = await getParlayDetail(client, ID)
    expect(detail?.ownerName).toBe('Grace')
    expect(queries[0].eq).toEqual([['id', ID]])
    expect(queries[1].table).toBe('profiles')
    expect(queries.some((q) => q.rpc)).toBe(false)
  })

  it('asks parlay_leg_odds for the legs whose odds aren’t set yet', async () => {
    const { client, queries } = fakeSupabase((q) =>
      q.table === 'parlays'
        ? { data: row([leg({ locked_odds: null })]) }
        : q.table === 'parlay_leg_odds'
          ? { data: [{ parlay_id: ID, outcome_id: 'o-yes', odds: 2.5, known: false }] }
          : { data: { display_name: 'Grace' } },
    )
    const detail = await getParlayDetail(client, ID)
    expect(queries.find((q) => q.rpc)?.table).toBe('parlay_leg_odds')
    expect(detail?.legs[0]).toMatchObject({ oddsBp: 25_000, oddsKnown: false })
  })
})

describe('legTally and tallySummary', () => {
  it('counts each state and leaves out the empty ones', () => {
    const tally = legTally([{ status: 'won' }, { status: 'open' }, { status: 'open' }, { status: 'awaiting' }, { status: 'voided' }])
    expect(tally).toEqual({ won: 1, lost: 0, open: 2, awaiting: 1, voided: 1 })
    expect(tallySummary(tally)).toBe('1 won · 2 open · 1 awaiting · 1 called off')
  })
})
