import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

describe('tasks table', () => {
  it('accepts a valid one-time task with the expected defaults', async () => {
    const db = serviceClient()
    const { data, error } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('is_repeatable, period, is_active')
      .single()

    expect(error).toBeNull()
    expect(data).toEqual({ is_repeatable: false, period: null, is_active: true })
  })

  it('accepts a valid repeatable task', async () => {
    const db = serviceClient()
    const { data, error } = await db
      .from('tasks')
      .insert({
        title: 'Attend Home Church',
        reward_amount: 15,
        is_repeatable: true,
        period: 'weekly',
        created_by: alice.id,
      })
      .select('period')
      .single()

    expect(error).toBeNull()
    expect(data?.period).toBe('weekly')
  })

  it('rejects a non-positive reward amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('tasks')
      .insert({ title: 'Bad task', reward_amount: 0, created_by: alice.id })
    expect(error).not.toBeNull()
  })

  it('rejects a repeatable task with no period', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('tasks')
      .insert({ title: 'Bad task', reward_amount: 10, is_repeatable: true, created_by: alice.id })
    expect(error).not.toBeNull()
  })

  it('rejects a one-time task with a period set', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('tasks')
      .insert({ title: 'Bad task', reward_amount: 10, period: 'weekly', created_by: alice.id })
    expect(error).not.toBeNull()
  })
})

describe('task_completions table', () => {
  it('defaults a new row to pending status', async () => {
    const db = serviceClient()
    const { data: task } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('id')
      .single()

    const { data, error } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })
      .select('status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('pending')
  })

  it('rejects a second pending row for the same task/profile/period', async () => {
    const db = serviceClient()
    const { data: task } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('id')
      .single()

    await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })

    const { error } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })

    expect(error).not.toBeNull()
  })

  it('allows a fresh row for the same task/profile/period once the prior one is rejected', async () => {
    const db = serviceClient()
    const { data: task } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('id')
      .single()

    const { data: first } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })
      .select('id')
      .single()

    await db.from('task_completions').update({ status: 'rejected' }).eq('id', first!.id)

    const { error } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })

    expect(error).toBeNull()
  })
})
