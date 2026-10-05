import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient, wipeDatabase } from './helpers'
import { expectError } from './assertions'
import { makeMember, type Member } from './fixtures'

let creator: Member

beforeAll(async () => {
  await wipeDatabase()

  creator = await makeMember('Carla')
})

describe('markets table', () => {
  it('accepts a valid row with the expected defaults', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data, error } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Test market', kind: 'binary', close_at: closeAt })
      .select('status, current_resolution_id')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('open')
    expect(data?.current_resolution_id).toBeNull()
  })

  it('rejects an invalid kind', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { error } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Bad kind', kind: 'weird', close_at: closeAt })
    expectError(error, { code: '23514', message: 'markets_kind_check' })
  })
})

describe('market_outcomes table', () => {
  it('enforces a unique label per market', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Dup labels', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()

    const { error: first } = await db.from('market_outcomes').insert({ market_id: market!.id, label: 'Yes', position: 0 })
    expect(first).toBeNull()

    const { error: second } = await db.from('market_outcomes').insert({ market_id: market!.id, label: 'Yes', position: 1 })
    expect(second).not.toBeNull()
  })

  it('rejects a negative pool_total', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Neg pool', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()
    const { data: outcome } = await db
      .from('market_outcomes')
      .insert({ market_id: market!.id, label: 'Yes', position: 0 })
      .select('id')
      .single()

    const { error } = await db.from('market_outcomes').update({ pool_total: -1 }).eq('id', outcome!.id)
    expectError(error, { code: '23514', message: 'market_outcomes_pool_total_check' })
  })
})

describe('bets table', () => {
  it('rejects a non-positive amount', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Bet amount', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()
    const { data: outcome } = await db
      .from('market_outcomes')
      .insert({ market_id: market!.id, label: 'Yes', position: 0 })
      .select('id')
      .single()

    const { error } = await db
      .from('bets')
      .insert({ market_id: market!.id, outcome_id: outcome!.id, profile_id: creator.id, amount: 0 })
    expectError(error, { code: '23514', message: 'bets_amount_check' })
  })
})

describe('market_resolutions table', () => {
  it('accepts a valid row and lets markets.current_resolution_id reference it', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60_000).toISOString()
    const { data: market } = await db
      .from('markets')
      .insert({ created_by: creator.id, title: 'Resolution link', kind: 'binary', close_at: closeAt })
      .select('id')
      .single()
    const { data: outcome } = await db
      .from('market_outcomes')
      .insert({ market_id: market!.id, label: 'Yes', position: 0 })
      .select('id')
      .single()

    const { data: resolution, error: resErr } = await db
      .from('market_resolutions')
      .insert({ market_id: market!.id, outcome_id: outcome!.id, resolved_by: creator.id })
      .select('id')
      .single()
    expect(resErr).toBeNull()

    const { error: linkErr } = await db
      .from('markets')
      .update({ current_resolution_id: resolution!.id })
      .eq('id', market!.id)
    expect(linkErr).toBeNull()
  })
})
