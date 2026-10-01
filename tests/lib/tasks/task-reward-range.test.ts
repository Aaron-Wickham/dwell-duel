import { describe, it, expect } from 'vitest'
import { fakeSupabase } from '@/tests/lib/fake-supabase'
import { getTaskRewardRange } from '@/lib/tasks/list-tasks'

describe('getTaskRewardRange (#260)', () => {
  it('reads the lowest and highest active reward', async () => {
    const { client, queries } = fakeSupabase((q) => ({ data: { reward_amount: (q.order[0][1] as { ascending: boolean }).ascending ? 5 : 25 } }))
    expect(await getTaskRewardRange(client)).toEqual({ min: 5, max: 25 })
    expect(queries.every((q) => q.table === 'tasks' && q.eq.some(([c, v]) => c === 'is_active' && v === true))).toBe(true)
  })

  it('is null with no active tasks', async () => {
    const { client } = fakeSupabase(() => ({ data: null }))
    expect(await getTaskRewardRange(client)).toBeNull()
  })

  it('is null, not an error, when the read fails, so Home still shows the plain nudge', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('down') }))
    expect(await getTaskRewardRange(client)).toBeNull()
  })
})
