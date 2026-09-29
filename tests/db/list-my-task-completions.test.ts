import { describe, it, expect, beforeEach } from 'vitest'
import { countPendingTaskCompletions, getMyPendingRewards, listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

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
    const completions = await listMyTaskCompletions(aliceClient, alice.id)

    expect(completions).toContainEqual(expect.objectContaining({ taskId, status: 'pending', reviewNote: null }))
  })

  it("returns a rejected completion with the admin's reason as reviewNote", async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('reject_task_completion', {
      p_completion_id: completionId,
      p_reason: 'Please write a full paragraph.',
    })
    expect(error).toBeNull()

    const aliceClient = await clientFor(alice)
    const completions = await listMyTaskCompletions(aliceClient, alice.id)

    expect(completions).toContainEqual(
      expect.objectContaining({ taskId, status: 'rejected', reviewNote: 'Please write a full paragraph.' }),
    )
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

    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('reject_task_completion', { p_completion_id: rejectedId })).error).toBeNull()

    const aliceClient = await clientFor(alice)
    const history = await listMyTaskCompletions(aliceClient, alice.id)
    const pending = history.filter((c) => c.status === 'pending')
    expect(await getMyPendingRewards(aliceClient, alice.id)).toEqual({
      count: pending.length,
      dc: pending.reduce((sum, c) => sum + c.rewardAmount, 0),
    })
    expect(await getMyPendingRewards(aliceClient, alice.id)).toEqual({ count: 2, dc: 45 })
    expect(await countPendingTaskCompletions(adminClient)).toBe(2)
  })
})
