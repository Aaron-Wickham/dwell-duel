import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { serviceClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, ensureInvited, giveRole, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

// create_market_v3 (0102) checks what create_market did; since 0105 the old functions refuse.
describe('create_market_v3', () => {
  it('creates a binary market with exactly the given outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { data: created, error } = await client.rpc('create_market_v3', {
      p_title: 'Will it rain?',
      p_description: 'Tomorrow, in town',
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expect(error).toBeNull()
    const marketId = (created as { market_id: string }).market_id

    const db = serviceClient()
    const { data: market } = await db.from('markets').select('title, created_by, status').eq('id', marketId!).single()
    expect(market?.title).toBe('Will it rain?')
    expect(market?.created_by).toBe(alice.id)
    expect(market?.status).toBe('open')

    const { data: outcomes } = await db.from('market_outcomes').select('label').eq('market_id', marketId!)
    expect(outcomes?.map((o) => o.label).sort()).toEqual(['No', 'Yes'])
  })

  it('rejects a binary market with more or fewer than 2 outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { error } = await client.rpc('create_market_v3', {
      p_title: 'Bad binary',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No', 'Maybe'],
      p_close_at: closeAt,
    })
    expectError(error, 'a binary market must have exactly 2 outcomes')
  })

  it('rejects more than 6 outcomes', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()

    const { error } = await client.rpc('create_market_v3', {
      p_title: 'Too many options',
      p_description: null,
      p_kind: 'multiple_choice',
      p_outcome_labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      p_close_at: closeAt,
    })
    expectError(error, 'a market may have at most 6 outcomes')
  })

  it('rejects a close time in the past', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() - 60_000).toISOString()

    const { error } = await client.rpc('create_market_v3', {
      p_title: 'Already closed',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expectError(error, 'close time must be in the future')
  })
})

// #258: Next replays an action whose response was lost, so a repeat of the key must not make a
// second market. Since 0105 create_market_v2 and create_market belong to a build that would make pool
// markets, so they refuse, apart from replaying an attempt that already finished.
describe('create_market_v2 and create_market since 0105', () => {
  const args = (key: string | null) => ({
    p_title: 'Replayed market',
    p_description: null as unknown as string,
    p_kind: 'binary',
    p_outcome_labels: ['Yes', 'No'],
    p_close_at: new Date(Date.now() + 60_000).toISOString(),
    p_idempotency_key: key ?? undefined,
  })
  const REFUSED = 'DwellDuel just updated. Refresh to create a market.'

  it('refuses to make a market, and makes none', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    expectError((await client.rpc('create_market_v2', args(randomUUID()))).error, REFUSED)
    const { p_idempotency_key: _key, ...old } = args(null)
    expectError((await client.rpc('create_market', old)).error, REFUSED)
    const { count } = await serviceClient().from('markets').select('id', { count: 'exact', head: true }).eq('created_by', alice.id)
    expect(count).toBe(0)
  })

  it('replays an attempt that already finished, and leaves a refused key free', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const key = randomUUID()
    const first = await client.rpc('create_market_v3', args(key))
    expect(first.error).toBeNull()
    const replay = await client.rpc('create_market_v2', args(key))
    expect(replay.error).toBeNull()
    expect(replay.data).toEqual({ market_id: (first.data as { market_id: string }).market_id, replayed: true })

    const fresh = randomUUID()
    expectError((await client.rpc('create_market_v2', args(fresh))).error, REFUSED)
    // The refusal rolled its claim back, so the new build can still use the key.
    expect((await client.rpc('create_market_v3', args(fresh))).data).toEqual({ market_id: expect.any(String), replayed: false })
  })
})

describe('attempt_key columns', () => {
  it('refuses a second comment or task with the same key', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: created } = await client.rpc('create_market_v3', {
      p_title: 'Thread', p_description: null as unknown as string, p_kind: 'binary', p_outcome_labels: ['Yes', 'No'], p_close_at: closeAt,
    })
    const marketId = (created as { market_id: string }).market_id
    const key = randomUUID()
    const row = { market_id: marketId as string, profile_id: alice.id, body: 'Hi', attempt_key: key }
    expect((await client.from('market_comments').insert(row)).error).toBeNull()
    const again = await client.from('market_comments').insert(row)
    expectError(again.error, { code: '23505', message: 'market_comments_attempt_key_idx' })
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
    expectError(again.error, { code: '23505', message: 'tasks_attempt_key_idx' })
    const { count } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('attempt_key', key)
    expect(count).toBe(1)
  })
})
