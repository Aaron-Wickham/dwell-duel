import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, expectError } from './helpers'
import { seedMembers, clientFor, ensureInvited, type Member } from './fixtures'

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

    const { error } = await client.rpc('create_market', {
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

    const { error } = await client.rpc('create_market', {
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

    const { error } = await client.rpc('create_market', {
      p_title: 'Already closed',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: closeAt,
    })
    expectError(error, 'close time must be in the future')
  })
})
