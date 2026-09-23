import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('tasks select policy', () => {
  it('lets an invited member read tasks', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { data, error } = await aliceClient.from('tasks').select('id').eq('id', taskId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('a non-invited authenticated session sees zero rows', async () => {
    const { taskId } = await createTestTask(alice)
    const bobClient = await clientFor(bob)

    const { data, error } = await bobClient.from('tasks').select('id').eq('id', taskId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('tasks write policy', () => {
  it('rejects a non-admin inserting a task', async () => {
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.from('tasks').insert({ title: 'Sneaky', reward_amount: 10 })
    expect(error).not.toBeNull()
  })

  it('lets an admin insert and update a task', async () => {
    const adminClient = await clientFor(alice)
    await ensureInvited(adminClient)
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)

    const { data, error } = await adminClient
      .from('tasks')
      .insert({ title: 'Admin task', reward_amount: 10 })
      .select('id, created_by')
      .single()
    expect(error).toBeNull()
    expect(data?.created_by).toBe(alice.id)

    const { error: updateErr } = await adminClient
      .from('tasks')
      .update({ is_active: false })
      .eq('id', data!.id)
    expect(updateErr).toBeNull()
  })
})

describe('task_completions select policy', () => {
  it("shows a member only their own completions", async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    const bobClient = await clientFor(bob)
    await ensureInvited(aliceClient)
    await ensureInvited(bobClient)

    await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    await bobClient.rpc('submit_task_completion', { p_task_id: taskId })

    const { data, error } = await aliceClient.from('task_completions').select('profile_id')
    expect(error).toBeNull()
    expect(data?.every((c) => c.profile_id === alice.id)).toBe(true)
  })

  it('shows an admin every completion', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })

    const adminClient = await clientFor(bob)
    await ensureInvited(adminClient)
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const { data, error } = await adminClient.from('task_completions').select('profile_id')
    expect(error).toBeNull()
    expect(data?.some((c) => c.profile_id === alice.id)).toBe(true)
  })
})

describe('task_completions direct writes', () => {
  it('rejects a direct insert, bypassing submit_task_completion', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { error } = await aliceClient
      .from('task_completions')
      .insert({ task_id: taskId, profile_id: alice.id, reward_amount: 999, period_key: 'once' })
    expect(error).not.toBeNull()

    const { count } = await serviceClient()
      .from('task_completions')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
    expect(count).toBe(0)
  })

  it('rejects a direct update, bypassing approve/reject_task_completion', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { data: completionId } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient
      .from('task_completions')
      .update({ status: 'approved' })
      .eq('id', completionId as string)
    expect(error).not.toBeNull()

    const { data: row } = await serviceClient()
      .from('task_completions')
      .select('status')
      .eq('id', completionId as string)
      .single()
    expect(row?.status).toBe('pending')
  })
})
