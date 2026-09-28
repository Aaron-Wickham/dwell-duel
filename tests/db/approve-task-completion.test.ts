import { describe, it, expect, beforeEach } from 'vitest'
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

describe('approve_task_completion', () => {
  it('rejects a non-admin caller', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('approve_task_completion', { p_completion_id: completionId })
    expect(error).not.toBeNull()
  })

  it('grants exactly the reward amount through the real ledger', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 30 })
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance + 30)

    const { data: txns } = await serviceClient()
      .from('coin_transactions')
      .select('amount, type')
      .eq('profile_id', alice.id)
    expect(txns).toContainEqual(expect.objectContaining({ amount: 30, type: 'task_completed' }))

    const { data: completion } = await serviceClient()
      .from('task_completions')
      .select('status, reviewed_by')
      .eq('id', completionId)
      .single()
    expect(completion).toEqual({ status: 'approved', reviewed_by: bob.id })
  })

  it('rejects approving a completion that is not pending', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    await adminClient.rpc('approve_task_completion', { p_completion_id: completionId })

    const { error } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId })
    expect(error).not.toBeNull()
  })
})
