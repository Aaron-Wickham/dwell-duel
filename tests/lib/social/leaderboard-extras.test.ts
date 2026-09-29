import { describe, expect, it, vi } from 'vitest'
import { getAwards, getPastChampions, getRace, getRecords } from '@/lib/social/leaderboard-extras'
import type { DbClient } from '@/lib/supabase/database'
import { fakeSupabase } from '../fake-supabase'

const rpcClient = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn(async () => ({ data, error }))
  return { client: { rpc } as unknown as DbClient, rpc }
}

describe('getRace', () => {
  it('groups the rows into one series per member, best final total first', async () => {
    const { client, rpc } = rpcClient([
      { profile_id: 'a', display_name: 'Ada', step: 0, at: '2026-09-03T14:00:00+00:00', profit: 0 },
      { profile_id: 'a', display_name: 'Ada', step: 1, at: '2026-09-03T14:00:00+00:00', profit: '5' },
      { profile_id: 'b', display_name: 'Ben', step: 0, at: '2026-09-03T14:00:00+00:00', profit: 0 },
      { profile_id: 'b', display_name: 'Ben', step: 1, at: '2026-09-03T14:00:00+00:00', profit: 12 },
    ])
    const race = await getRace(client, 2)
    expect(rpc).toHaveBeenCalledWith('leaderboard_race_steps', { p_top: 2 })
    expect(race.map((s) => [s.name, s.final])).toEqual([
      ['Ben', 12],
      ['Ada', 5],
    ])
    expect(race[1].points).toEqual([
      { at: '2026-09-03T14:00:00+00:00', profit: 0 },
      { at: '2026-09-03T14:00:00+00:00', profit: 5 },
    ])
  })

  it('throws when the read fails', async () => {
    const failure = new Error('db down')
    await expect(getRace(rpcClient(null, failure).client)).rejects.toBe(failure)
  })
})

describe('getAwards', () => {
  it('returns the awards in a fixed order with numbers as numbers', async () => {
    const { client } = rpcClient([
      { kind: 'most_active', profile_id: 'a', display_name: 'Ada', avatar_path: null, value: '7', detail: '7 bets and parlays' },
      { kind: 'biggest_win', profile_id: 'b', display_name: 'Ben', avatar_path: null, value: '64', detail: 'Will it rain?' },
    ])
    const awards = await getAwards(client)
    expect(awards.map((a) => a.kind)).toEqual(['biggest_win', 'most_active'])
    expect(awards[0]).toMatchObject({ memberId: 'b', name: 'Ben', value: 64, detail: 'Will it rain?' })
  })
})

describe('getRecords', () => {
  it('reads records in chunks and joins them by member', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const rpc = vi.fn(async (_fn: string, args: { p_ids: string[] }) => ({
      data: args.p_ids.map((id) => ({ profile_id: id, won: 1, lost: 2 })),
      error: null,
    }))
    const records = await getRecords({ rpc } as unknown as DbClient, ids)
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(records.size).toBe(120)
    expect(records.get('m119')).toEqual({ won: 1, lost: 2 })
  })

  it('makes no call for an empty page', async () => {
    const rpc = vi.fn()
    expect((await getRecords({ rpc } as unknown as DbClient, [])).size).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('getPastChampions', () => {
  it('reads season_champion events newest first and names each month from its id', async () => {
    const { client, queries } = fakeSupabase(() => ({
      data: [
        { id: 'season:2026-08', actor_id: 'a', amount: 140, actor: { display_name: 'Ada' } },
        { id: 'season:junk', actor_id: 'b', amount: 5, actor: { display_name: 'Ben' } },
      ],
    }))
    const champions = await getPastChampions(client, 3)
    expect(queries[0].eq).toEqual([['kind', 'season_champion']])
    expect(queries[0].limit).toBe(3)
    expect(champions).toEqual([{ season: '2026-08', memberId: 'a', name: 'Ada', profit: 140 }])
  })
})
