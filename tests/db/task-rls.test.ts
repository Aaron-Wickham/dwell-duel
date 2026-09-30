import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, expectError } from './helpers'
import { seedMembers, makeMember, clientFor, ensureInvited, createTestTask, type Member, giveRole } from './fixtures'

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
    expectError(error, { code: '42501', message: 'new row violates row-level security policy for table "tasks"' })
  })

  it('lets an admin insert and update a task', async () => {
    const adminClient = await clientFor(alice)
    await ensureInvited(adminClient)
    await giveRole(alice, 'admin')

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
  it('shows a member only their own pending completions', async () => {
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
    await giveRole(bob, 'admin')
    const { data, error } = await adminClient.from('task_completions').select('profile_id')
    expect(error).toBeNull()
    expect(data?.some((c) => c.profile_id === alice.id)).toBe(true)
  })

  it('shows other invited members approved completions only', async () => {
    const approvedTask = await createTestTask(alice, { title: 'Approved task' })
    const rejectedTask = await createTestTask(alice, { title: 'Rejected task' })
    const pendingTask = await createTestTask(alice, { title: 'Pending task' })

    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const submit = async (taskId: string): Promise<string> => {
      const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
      if (error) throw error
      return data as string
    }
    const approvedId = await submit(approvedTask.taskId)
    const rejectedId = await submit(rejectedTask.taskId)
    await submit(pendingTask.taskId)

    await giveRole(alice, 'admin')
    const adminClient = await clientFor(alice)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('approve_task_completion', { p_completion_id: approvedId })).error).toBeNull()
    expect(
      (await adminClient.rpc('reject_task_completion', { p_completion_id: rejectedId, p_reason: 'Not this week' })).error,
    ).toBeNull()

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    await ensureInvited(carolClient)
    const { data: seenByCarol, error } = await carolClient.from('task_completions').select('id, status')
    expect(error).toBeNull()
    expect(seenByCarol).toEqual([{ id: approvedId, status: 'approved' }])

    const { data: seenByBob } = await bobClient.from('task_completions').select('id')
    expect(seenByBob).toHaveLength(3)
  })

  it('shows an uninvited session no completions, even approved ones', async () => {
    const { taskId } = await createTestTask(alice)
    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()

    await giveRole(alice, 'admin')
    const adminClient = await clientFor(alice)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    const { data, error } = await carolClient.from('task_completions').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
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
    expectError(error, { code: '42501', message: 'permission denied for table task_completions' })

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

    await giveRole(bob, 'admin')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient
      .from('task_completions')
      .update({ status: 'approved' })
      .eq('id', completionId as string)
    expectError(error, { code: '42501', message: 'permission denied for table task_completions' })

    const { data: row } = await serviceClient()
      .from('task_completions')
      .select('status')
      .eq('id', completionId as string)
      .single()
    expect(row?.status).toBe('pending')
  })
})
