import { describe, it, expect } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'
import { getMyTaskStreaks } from '@/lib/tasks/streaks'
import { streakLabel, MIN_STREAK_SHOWN } from '@/lib/tasks/streak-label'
import { fakeSupabase } from '../fake-supabase'

describe('streakLabel', () => {
  it('names the period in the singular, hyphenated to the count', () => {
    expect(streakLabel('daily', 5)).toBe('5-day streak')
    expect(streakLabel('weekly', 5)).toBe('5-week streak')
    expect(streakLabel('monthly', 2)).toBe('2-month streak')
    expect(streakLabel('yearly', 3)).toBe('3-year streak')
  })

  it('starts showing at two periods', () => {
    expect(MIN_STREAK_SHOWN).toBe(2)
  })
})

describe('getMyTaskStreaks', () => {
  it('maps my_task_streaks rows to a streak per task id', async () => {
    const { client, queries } = fakeSupabase(() => ({
      data: [
        { task_id: 'a', streak: 4, includes_current: true },
        { task_id: 'b', streak: 1, includes_current: false },
      ],
    }))
    const streaks = await getMyTaskStreaks(client as DbClient)
    expect(queries[0]).toMatchObject({ table: 'my_task_streaks', rpc: true })
    expect(streaks).toEqual(
      new Map([
        ['a', 4],
        ['b', 1],
      ]),
    )
  })

  it('throws the RPC error', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('boom') }))
    await expect(getMyTaskStreaks(client as DbClient)).rejects.toThrow('boom')
  })
})
