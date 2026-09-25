import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { listFeed } from '@/lib/social/list-feed'
import { getLeaderboard } from '@/lib/social/leaderboard'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(aliceClient)
  await ensureInvited(bobClient)
})

describe('listFeed', () => {
  it('returns camel-cased events, newest first', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Reader market' })
    const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 7 })
    expect(error).toBeNull()

    const events = await listFeed(bobClient)
    expect(events.map((e) => e.kind)).toEqual(['bet_placed', 'market_created'])
    expect(events[0]).toMatchObject({
      kind: 'bet_placed',
      actorId: bob.id,
      actorName: 'Bob',
      marketId: market.marketId,
      marketTitle: 'Reader market',
      outcomeLabel: 'Yes',
      amount: 7,
      legCount: null,
      taskTitle: null,
    })
    expect(typeof events[0].occurredAt).toBe('string')
  })

  it("returns only one member's events when filtered", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Reader market' })
    const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 7 })
    expect(error).toBeNull()

    const events = await listFeed(bobClient, { actorId: alice.id })
    expect(events.map((e) => [e.kind, e.actorId])).toEqual([['market_created', alice.id]])
  })
})

describe('getLeaderboard', () => {
  it('ranks every member by balance, sharing ranks on ties', async () => {
    const carol = await makeMember('Carol')
    const db = serviceClient()
    await db.from('profiles').update({ balance: 150 }).eq('id', alice.id)
    await db.from('profiles').update({ balance: 150 }).eq('id', bob.id)
    await db.from('profiles').update({ balance: 90 }).eq('id', carol.id)

    const board = await getLeaderboard(bobClient)
    expect(board.map((m) => [m.displayName, m.balance, m.rank])).toEqual([
      ['Alice', 150, 1],
      ['Bob', 150, 1],
      ['Carol', 90, 3],
    ])
  })

  it('is empty for an uninvited session', async () => {
    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getLeaderboard(carolClient)).toEqual([])
  })
})
