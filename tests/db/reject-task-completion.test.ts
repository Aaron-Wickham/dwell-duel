import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { expectError } from './assertions'
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

describe('reject_task_completion', () => {
  it('rejects a non-admin caller', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('reject_task_completion', { p_completion_id: completionId })
    expectError(error, 'only a reviewer can reject a task completion')
  })

  it('moves zero coin and records the reason', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 30 })
    const completionId = await submitAsAlice(taskId)

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    const { error } = await adminClient.rpc('reject_task_completion', {
      p_completion_id: completionId,
      p_reason: 'wrong task',
    })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance)

    const { data: txns } = await serviceClient()
      .from('coin_transactions')
      .select('id')
      .eq('profile_id', alice.id)
      .eq('type', 'task_completed')
    expect(txns).toEqual([])

    const { data: completion } = await serviceClient()
      .from('task_completions')
      .select('status, review_note, reviewed_by')
      .eq('id', completionId)
      .single()
    expect(completion).toEqual({ status: 'rejected', review_note: 'wrong task', reviewed_by: bob.id })
  })

  it('rejects rejecting a completion that is not pending', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    await adminClient.rpc('reject_task_completion', { p_completion_id: completionId })

    const { error } = await adminClient.rpc('reject_task_completion', { p_completion_id: completionId })
    expectError(error, 'completion is not pending')
  })

  it('lets the member resubmit for the same period immediately after rejection', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    await adminClient.rpc('reject_task_completion', { p_completion_id: completionId })

    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()
  })
})
