import { describe, it, expect, beforeEach } from 'vitest'
import { getMyPendingRewards, listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member

async function submitAsAlice(taskId: string) {
  const aliceClient = await clientFor(alice)
  await ensureInvited(aliceClient)
  const { data } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
  return data as string
}

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('listMyTaskCompletions', () => {
  it('returns a pending completion with reviewNote: null', async () => {
    const { taskId } = await createTestTask(alice)
    await submitAsAlice(taskId)

    const aliceClient = await clientFor(alice)
    const completions = await listMyTaskCompletions(aliceClient)

    expect(completions).toContainEqual(expect.objectContaining({ taskId, status: 'pending', reviewNote: null }))
  })

  it("returns a rejected completion with the admin's reason as reviewNote", async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('reject_task_completion', {
      p_completion_id: completionId,
      p_reason: 'Please write a full paragraph.',
    })
    expect(error).toBeNull()

    const aliceClient = await clientFor(alice)
    const completions = await listMyTaskCompletions(aliceClient)

    expect(completions).toContainEqual(
      expect.objectContaining({ taskId, status: 'rejected', reviewNote: 'Please write a full paragraph.' }),
    )
  })
})

// #206: the page needs one row per task for the current period, not the member's whole history.
describe('my_current_task_completions (0071)', () => {
  it('returns only the current period’s newest row per task, a one-off included, and never another member’s', async () => {
    const daily = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    const once = await createTestTask(alice)
    const untouched = await createTestTask(alice)
    const current = await submitAsAlice(daily.taskId)
    await submitAsAlice(once.taskId)
    const db = serviceClient()
    // Yesterday's row, as the page used to read it along with every older one.
    const { error } = await db
      .from('task_completions')
      .insert({ task_id: daily.taskId, profile_id: alice.id, status: 'approved', reward_amount: 10, reviewed_at: new Date().toISOString(), period_key: '2020-01-01' })
    if (error) throw error
    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const { error: bobErr } = await bobClient.rpc('submit_task_completion', { p_task_id: untouched.taskId })
    if (bobErr) throw bobErr

    const aliceClient = await clientFor(alice)
    const completions = await listMyTaskCompletions(aliceClient)

    expect(completions.map((c) => c.taskId).sort()).toEqual([daily.taskId, once.taskId].sort())
    expect(completions.find((c) => c.taskId === daily.taskId)).toEqual({ taskId: daily.taskId, status: 'pending', rewardAmount: 10, reviewNote: null, proofCount: 0 })
    // The row it picked is today's, not 2020's approved one.
    const { data: row } = await db.from('task_completions').select('status').eq('id', current).single()
    expect(row?.status).toBe('pending')
  })

  it('filters with the same keys compute_period_key gives, so a member sees exactly what they may still submit', async () => {
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    for (const period of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      const { taskId } = await createTestTask(alice, { isRepeatable: true, period })
      await submitAsAlice(taskId)
      const { data: key } = await aliceClient.rpc('compute_period_key', { p_period: period })
      const { data: stored } = await serviceClient().from('task_completions').select('period_key').eq('task_id', taskId).single()
      expect(stored?.period_key).toBe(key)
      expect((await listMyTaskCompletions(aliceClient)).some((c) => c.taskId === taskId)).toBe(true)
    }
  })
})

describe("Home's pending counts (#68)", () => {
  it('equal what the full history gave: pending only, with their rewards', async () => {
    const pendingTask = await createTestTask(alice, { rewardAmount: 30 })
    const otherPending = await createTestTask(alice, { rewardAmount: 15 })
    const rejectedTask = await createTestTask(alice, { rewardAmount: 99 })
    await submitAsAlice(pendingTask.taskId)
    await submitAsAlice(otherPending.taskId)
    const rejectedId = await submitAsAlice(rejectedTask.taskId)

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('reject_task_completion', { p_completion_id: rejectedId })).error).toBeNull()

    const aliceClient = await clientFor(alice)
    const history = await listMyTaskCompletions(aliceClient)
    const pending = history.filter((c) => c.status === 'pending')
    expect(await getMyPendingRewards(aliceClient, alice.id)).toEqual({
      count: pending.length,
      dc: pending.reduce((sum, c) => sum + c.rewardAmount, 0),
    })
    expect(await getMyPendingRewards(aliceClient, alice.id)).toEqual({ count: 2, dc: 45 })
  })
})
