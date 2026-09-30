import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, giveRole, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

describe('create_market', () => {
  it('creates a binary market with exactly the given outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { data: marketId, error } = await client.rpc('create_market', {
      p_title: 'Will it rain?',
      p_description: 'Tomorrow, in town',
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: market } = await db.from('markets').select('title, created_by, status').eq('id', marketId).single()
    expect(market?.title).toBe('Will it rain?')
    expect(market?.created_by).toBe(alice.id)
    expect(market?.status).toBe('open')

    const { data: outcomes } = await db.from('market_outcomes').select('label').eq('market_id', marketId)
    expect(outcomes?.map((o) => o.label).sort()).toEqual(['No', 'Yes'])
  })

  it('rejects a binary market with more or fewer than 2 outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { error } = await client.rpc('create_market', {
      p_title: 'Bad binary',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No', 'Maybe'],
      p_close_at: closeAt,
    })
    expect(error).not.toBeNull()
  })

  it('rejects more than 6 outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { error } = await client.rpc('create_market', {
      p_title: 'Too many options',
      p_description: null,
      p_kind: 'multiple_choice',
      p_outcome_labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      p_close_at: closeAt,
    })
    expect(error).not.toBeNull()
  })

  it('rejects a close time in the past', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() - 60_000).toISOString()

    const { error } = await client.rpc('create_market', {
      p_title: 'Already closed',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expect(error).not.toBeNull()
  })
})

// #258: Next replays an action whose response was lost, so a repeat of the key must not make a
// second market.
describe('create_market_v2 attempt key', () => {
  const args = (key: string | null) => ({
    p_title: 'Replayed market',
    p_description: null,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60_000).toISOString(),
    p_idempotency_key: key ?? undefined,
  })

  it('returns the first market for a repeat of the key and creates no second row', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const key = randomUUID()

    const first = await client.rpc('create_market_v2', args(key))
    const second = await client.rpc('create_market_v2', args(key))
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(first.data).toEqual({ market_id: expect.any(String), replayed: false })
    expect(second.data).toEqual({ market_id: (first.data as { market_id: string }).market_id, replayed: true })

    const { count } = await serviceClient().from('markets').select('id', { count: 'exact', head: true }).eq('created_by', alice.id)
    expect(count).toBe(1)
  })

  it('makes a second market for a new key, and the old signature still works', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const a = await client.rpc('create_market_v2', args(randomUUID()))
    const b = await client.rpc('create_market_v2', args(randomUUID()))
    expect((a.data as { market_id: string }).market_id).not.toBe((b.data as { market_id: string }).market_id)
    const { error } = await client.rpc('create_market', {
      p_title: 'Old signature',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(error).toBeNull()
  })
})

describe('attempt_key columns', () => {
  it('refuses a second comment or task with the same key', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: marketId } = await client.rpc('create_market', {
      p_title: 'Thread', p_description: null, p_kind: 'binary', p_outcome_labels: ['Yes', 'No'], p_close_at: closeAt,
    })
    const key = randomUUID()
    const row = { market_id: marketId as string, profile_id: alice.id, body: 'Hi', attempt_key: key }
    expect((await client.from('market_comments').insert(row)).error).toBeNull()
    const again = await client.from('market_comments').insert(row)
    expect(again.error?.code).toBe('23505')
    expect(again.error?.message).toContain('market_comments_attempt_key_idx')
  })

  it('makes a task once per attempt key', async () => {
    const db = serviceClient()
    await giveRole(alice, 'admin')
    const client = await clientFor(alice)
    await ensureInvited(client)
    const key = randomUUID()
    const row = { title: 'Read Genesis 1', reward_amount: 10, is_repeatable: false, attempt_key: key }
    expect((await client.from('tasks').insert(row)).error).toBeNull()
    const again = await client.from('tasks').insert(row)
    expect(again.error?.code).toBe('23505')
    expect(again.error?.message).toContain('tasks_attempt_key_idx')
    const { count } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('attempt_key', key)
    expect(count).toBe(1)
  })
})
