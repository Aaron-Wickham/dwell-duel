import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'
import { pgQuery } from './pg-query'

let alice: Member
let bob: Member
let adminClient: SupabaseClient
let bobClient: SupabaseClient

const MISSING = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
  adminClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function submitAsBob(rewardAmount: number): Promise<string> {
  const { taskId } = await createTestTask(alice, { rewardAmount })
  const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
  if (error) throw error
  return data as string
}

async function bobsRewards(): Promise<{ amount: number; completion_id: string }[]> {
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('amount, meta')
    .eq('profile_id', bob.id)
    .eq('type', 'task_completed')
  if (error) throw error
  return data.map((t) => ({ amount: t.amount, completion_id: t.meta.completion_id }))
}

async function statusOf(completionId: string): Promise<{ status: string; review_note: string | null }> {
  const { data, error } = await serviceClient()
    .from('task_completions')
    .select('status, review_note')
    .eq('id', completionId)
    .single()
  if (error) throw error
  return data
}

describe('review_task_completions', () => {
  it('reports each distinct id on its own row, in id order, and the failures hold nobody else up', async () => {
    const first = await submitAsBob(10)
    const second = await submitAsBob(7)
    const reviewed = await submitAsBob(5)
    const { error: approveErr } = await adminClient.rpc('approve_task_completion', { p_completion_id: reviewed })
    if (approveErr) throw approveErr

    const { data, error } = await adminClient.rpc('review_task_completions', {
      p_ids: [second, reviewed, MISSING, first, second],
      p_approve: true,
    })

    expect(error).toBeNull()
    const expected = [
      { id: first, ok: true, error: null },
      { id: second, ok: true, error: null },
      { id: reviewed, ok: false, error: 'completion is not pending' },
      { id: MISSING, ok: false, error: 'completion not found' },
    ].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(data).toEqual(expected)
    expect((await statusOf(first)).status).toBe('approved')
    expect((await statusOf(second)).status).toBe('approved')
  })

  it('credits each approved completion exactly once, through the ledger', async () => {
    const first = await submitAsBob(10)
    const second = await submitAsBob(7)
    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()

    const { error } = await adminClient.rpc('review_task_completions', { p_ids: [first, second, first], p_approve: true })
    expect(error).toBeNull()
    const { data: again } = await adminClient.rpc('review_task_completions', { p_ids: [first, second], p_approve: true })
    expect(again.every((row: { ok: boolean }) => !row.ok)).toBe(true)

    expect(await bobsRewards()).toEqual(
      expect.arrayContaining([
        { amount: 10, completion_id: first },
        { amount: 7, completion_id: second },
      ]),
    )
    expect(await bobsRewards()).toHaveLength(2)
    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
    expect(after!.balance).toBe(before!.balance + 17)
  })

  it('rejects with the note and credits nothing', async () => {
    const first = await submitAsBob(10)
    const second = await submitAsBob(7)

    const { data, error } = await adminClient.rpc('review_task_completions', {
      p_ids: [first, second],
      p_approve: false,
      p_note: 'Photo is blurry',
    })

    expect(error).toBeNull()
    expect(data.map((row: { ok: boolean }) => row.ok)).toEqual([true, true])
    expect(await statusOf(first)).toEqual({ status: 'rejected', review_note: 'Photo is blurry' })
    expect(await statusOf(second)).toEqual({ status: 'rejected', review_note: 'Photo is blurry' })
    expect(await bobsRewards()).toEqual([])
  })

  it('refuses a member who is not an admin, changing nothing', async () => {
    const completion = await submitAsBob(10)

    const { data, error } = await bobClient.rpc('review_task_completions', { p_ids: [completion], p_approve: true })

    expect(data).toBeNull()
    expect(error?.message).toBe('only an admin can review task completions')
    expect(await statusOf(completion)).toEqual({ status: 'pending', review_note: null })
    expect(await bobsRewards()).toEqual([])
  })

  it('can be called by members and the service role, not anonymously', async () => {
    const [grants] = await pgQuery<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select
        has_function_privilege('anon', 'public.review_task_completions(uuid[], boolean, text)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.review_task_completions(uuid[], boolean, text)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.review_task_completions(uuid[], boolean, text)', 'execute') as service_role
    `)
    expect(grants).toEqual({ anon: false, authenticated: true, service_role: true })
  })
})
