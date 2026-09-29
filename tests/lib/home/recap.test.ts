import { describe, it, expect, vi } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'
import { getWeeklyRecap, toWeeklyRecap, type RecapRow } from '@/lib/home/recap'

const WEEK = { mode: 'last', monday: '2026-09-21', sunday: '2026-09-27' } as const

const EMPTY: RecapRow = {
  my_betting_net: 0,
  my_betting_moves: 0,
  my_task_income: 0,
  best_bettor_name: null,
  best_market_id: null,
  best_market_title: null,
  best_stake: null,
  best_payout: null,
  upset_market_id: null,
  upset_market_title: null,
  upset_outcome_label: null,
  upset_chance: null,
  top_tasker_name: null,
  top_tasker_count: null,
  closing_total: 0,
  closing: [],
}

function client(row: RecapRow | null) {
  const rpc = vi.fn(() => ({ maybeSingle: async () => ({ data: row, error: null }) }))
  return { supabase: { rpc } as unknown as DbClient, rpc }
}

describe('toWeeklyRecap', () => {
  it('has nothing to say about an empty week', () => {
    expect(toWeeklyRecap(WEEK, EMPTY)).toBeNull()
  })

  it('counts breaking even as having bet, and reads bigint strings', () => {
    const recap = toWeeklyRecap(WEEK, { ...EMPTY, my_betting_net: '0', my_betting_moves: 2, my_task_income: '12' })
    expect(recap?.me).toEqual({ betting: 0, bettingMoves: 2, tasks: 12 })
  })

  it('maps every figure', () => {
    const recap = toWeeklyRecap(WEEK, {
      ...EMPTY,
      best_bettor_name: 'Bob',
      best_market_id: 'm1',
      best_market_title: 'Will it rain?',
      best_stake: 10,
      best_payout: 26,
      upset_market_id: 'm2',
      upset_market_title: 'Sermon past noon?',
      upset_outcome_label: 'Yes',
      upset_chance: 0.25,
      top_tasker_name: 'Carol',
      top_tasker_count: 3,
      closing_total: 4,
      closing: [{ id: 'm3', title: 'Picnic', close_at: '2026-10-01T16:00:00+00:00' }],
    })
    expect(recap).toMatchObject({
      me: null,
      bestCall: { memberName: 'Bob', marketId: 'm1', marketTitle: 'Will it rain?', stake: 10, payout: 26 },
      upset: { marketId: 'm2', marketTitle: 'Sermon past noon?', outcomeLabel: 'Yes', chance: 0.25 },
      topTasker: { memberName: 'Carol', count: 3 },
      closing: { total: 4, markets: [{ id: 'm3', title: 'Picnic', closeAt: '2026-10-01T16:00:00+00:00' }] },
    })
  })
})

describe('getWeeklyRecap', () => {
  it("doesn't ask the database on a day with no recap", async () => {
    const { supabase, rpc } = client(EMPTY)
    expect(await getWeeklyRecap(supabase, new Date('2026-09-30T16:00:00Z'))).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it("asks for the Eastern week's Monday", async () => {
    const { supabase, rpc } = client({ ...EMPTY, closing_total: 1, closing: [{ id: 'm', title: 'T', close_at: '2026-10-01T16:00:00Z' }] })
    const recap = await getWeeklyRecap(supabase, new Date('2026-09-28T02:00:00Z'))
    expect(rpc).toHaveBeenCalledWith('weekly_recap', { p_week: '2026-09-21' })
    expect(recap).toMatchObject({ mode: 'so-far', monday: '2026-09-21', sunday: '2026-09-27' })
  })

  it('shows nothing to an uninvited session, which gets no row', async () => {
    expect(await getWeeklyRecap(client(null).supabase, new Date('2026-09-28T16:00:00Z'))).toBeNull()
  })
})
