import { describe, expect, it } from 'vitest'
import { fakeSupabase } from '../fake-supabase'
import { getParlayDetail, legTally, tallySummary, toParlayDetail } from '@/lib/parlays/get-parlay'

const ID = '0b9c3f5e-8a1d-4c2b-9e7f-000000000001'

function leg(over: Record<string, unknown> = {}, market: Record<string, unknown> = {}) {
  return {
    outcome_id: 'o-yes',
    locked_odds: 2.1,
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
  ({ id: ID, profile_id: 'u-1', stake: 5, status: 'pending', credited: 0, created_at: '2026-09-27T16:10:00Z', parlay_legs: legs, ...over }) as Parameters<
    typeof toParlayDetail
  >[0]

describe('toParlayDetail', () => {
  it('multiplies the locked odds and reads each leg’s state from its market', () => {
    const detail = toParlayDetail(
      row([
        leg({}, { status: 'resolved', current_resolution: { outcome_id: 'o-yes', resolved_at: '2026-09-29T10:00:00Z' } }),
        leg({ locked_odds: 2 }, { id: 'm-2', title: 'Other?' }),
      ]),
      'Grace',
    )
    expect(detail.ownerName).toBe('Grace')
    expect(detail.multiplierBp).toBe(42_000)
    expect(detail.potentialPayout).toBe(21)
    expect(detail.legs.map((l) => l.status)).toEqual(['won', 'pending'])
    expect(detail.legs[0]).toMatchObject({ winningLabel: 'Yes', resolvedAt: '2026-09-29T10:00:00Z', marketStatus: 'resolved' })
    expect(detail.legs[1]).toMatchObject({ winningLabel: null, closeAt: '2026-10-01T12:00:00Z' })
  })

  it('leaves a voided leg out of the multiplier, as settle_parlay does', () => {
    const detail = toParlayDetail(row([leg({}, { status: 'voided' }), leg({ locked_odds: 2 }, { id: 'm-2' })]), 'Grace')
    expect(detail.legs[0].status).toBe('voided')
    expect(detail.multiplierBp).toBe(20_000)
    expect(detail.potentialPayout).toBe(10)
  })

  it('marks a leg on the wrong side of a resolution as lost', () => {
    const detail = toParlayDetail(
      row([leg({}, { status: 'resolved', current_resolution: { outcome_id: 'o-no', resolved_at: '2026-09-29T10:00:00Z' } })]),
      'Grace',
    )
    expect(detail.legs[0]).toMatchObject({ status: 'lost', winningLabel: 'No' })
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
  })
})

describe('legTally and tallySummary', () => {
  it('counts each state and leaves out the empty ones', () => {
    const tally = legTally([{ status: 'won' }, { status: 'pending' }, { status: 'pending' }, { status: 'voided' }])
    expect(tally).toEqual({ won: 1, lost: 0, open: 2, voided: 1 })
    expect(tallySummary(tally)).toBe('1 won · 2 open · 1 voided')
  })
})
