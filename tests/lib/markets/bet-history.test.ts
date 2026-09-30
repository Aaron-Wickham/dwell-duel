import { describe, expect, it } from 'vitest'
import { hasBetHistory } from '@/lib/markets/bet-history'
import { fakeSupabase } from '../fake-supabase'
import type { DbClient } from '@/lib/supabase/database'

// delete_market refuses a market with cancelled bets or parlay legs even when its pool is empty, so
// the market page asks these two tables before showing "Delete this market" (#221).
describe('hasBetHistory', () => {
  it('asks cancelled_bets and parlay_legs for a head count of this market only', async () => {
    const { client, queries } = fakeSupabase(() => ({ count: 0 }))
    expect(await hasBetHistory(client as unknown as DbClient, 'm1')).toBe(false)

    expect(queries.map((q) => q.table).sort()).toEqual(['cancelled_bets', 'parlay_legs'])
    for (const q of queries) {
      expect(q.selectOptions).toEqual({ count: 'exact', head: true })
      expect(q.eq).toEqual([['market_id', 'm1']])
    }
  })

  it('reports history when either table has a row', async () => {
    const cancelledOnly = fakeSupabase((q) => ({ count: q.table === 'cancelled_bets' ? 1 : 0 }))
    expect(await hasBetHistory(cancelledOnly.client as unknown as DbClient, 'm1')).toBe(true)

    const legsOnly = fakeSupabase((q) => ({ count: q.table === 'parlay_legs' ? 2 : 0 }))
    expect(await hasBetHistory(legsOnly.client as unknown as DbClient, 'm1')).toBe(true)
  })

  it('throws when a count fails, rather than offering a delete that would be refused', async () => {
    const failure = new Error('db down')
    const { client } = fakeSupabase((q) => (q.table === 'parlay_legs' ? { error: failure } : { count: 0 }))
    await expect(hasBetHistory(client as unknown as DbClient, 'm1')).rejects.toBe(failure)
  })
})
