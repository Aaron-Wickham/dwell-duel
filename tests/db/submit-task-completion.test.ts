import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('submit_task_completion', () => {
  it('rejects a non-invited caller', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expectError(error, 'not invited')
  })

  it('rejects submitting an inactive task', async () => {
    const { taskId } = await createTestTask(alice)
    await serviceClient().from('tasks').update({ is_active: false }).eq('id', taskId)

    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expectError(error, 'task not found or inactive')
  })

  it('succeeds and snapshots the task reward amount', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 25 })
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { data: completionId, error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()

    const { data: row } = await serviceClient()
      .from('task_completions')
      .select('status, reward_amount, profile_id')
      .eq('id', completionId as string)
      .single()
    expect(row).toEqual({ status: 'pending', reward_amount: 25, profile_id: alice.id })
  })

  it('rejects a second submission for the same task while one is pending', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expectError(error, 'you already have a pending or approved submission for this task in the current period')
    expect(error?.message).toContain('you already have a pending or approved submission for this task in the current period')
  })

  it('allows resubmission after the prior one was rejected', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { data: firstId } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    await serviceClient().from('task_completions').update({ status: 'rejected' }).eq('id', firstId as string)

    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()
  })

  it('lets two different members each submit the same task independently', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    const bobClient = await clientFor(bob)
    await ensureInvited(aliceClient)
    await ensureInvited(bobClient)

    const { error: aliceErr } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    const { error: bobErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(aliceErr).toBeNull()
    expect(bobErr).toBeNull()
  })
})
