import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { listFeed } from '@/lib/social/list-feed'
import { getLeaderboard, getMemberStanding } from '@/lib/social/leaderboard'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

const NO_PAGE: PageParams = { top: null, bottom: null }

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

    const { rows, next, windowed } = await listFeed(bobClient, { page: NO_PAGE })
    expect(rows.map((e) => e.kind)).toEqual(['bet_placed', 'market_created'])
    expect(rows[0]).toMatchObject({
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
    expect(typeof rows[0].occurredAt).toBe('string')
    expect(next).toBeNull()
    expect(windowed).toBe(false)
  })

  it("returns only one member's events when filtered", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Reader market' })
    const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 7 })
    expect(error).toBeNull()

    const { rows } = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(rows.map((e) => [e.kind, e.actorId])).toEqual([['market_created', alice.id]])
  })

  it('pages an actor with more than 50 events: the first page is 50, and Show more extends the range to all of them', async () => {
    for (let i = 0; i < 51; i++) {
      await createTestMarket(aliceClient, ['Yes', 'No'], { title: `Paging market ${i}` })
    }

    const first = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(first.rows).toHaveLength(50)
    expect(first.windowed).toBe(false)
    expect(first.next?.kind).toBe('extend')

    // The cursor means "down to and including this row", so the extended range repeats the first
    // 50 and adds the 51st below them.
    const href = new URL(showMoreHref(`/members/${alice.id}`, {}, 'activity', first.next!), 'http://localhost')
    const second = await listFeed(bobClient, {
      actorId: alice.id,
      page: readPageParams(Object.fromEntries(href.searchParams), 'activity'),
    })
    expect(second.rows).toHaveLength(51)
    expect(second.rows.slice(0, 50).map((e) => e.id)).toEqual(first.rows.map((e) => e.id))
    expect(new Set(second.rows.map((e) => e.id)).size).toBe(51)
    expect(second.next).toBeNull()
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

describe('getMemberStanding', () => {
  it('computes rank from members strictly above, and the total membership', async () => {
    const carol = await makeMember('Carol')
    const db = serviceClient()
    await db.from('profiles').update({ balance: 150 }).eq('id', alice.id)
    await db.from('profiles').update({ balance: 90 }).eq('id', bob.id)
    await db.from('profiles').update({ balance: 90 }).eq('id', carol.id)

    const standing = await getMemberStanding(bobClient, bob.id)
    expect(standing).toMatchObject({ id: bob.id, displayName: 'Bob', balance: 90, rank: 2, memberCount: 3 })
  })

  it('returns null for a well-formed id that matches no profile — the member page’s real 404', async () => {
    expect(await getMemberStanding(bobClient, '00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('throws on a malformed id instead of silently matching nothing, which is why the page checks isUuid first', async () => {
    await expect(getMemberStanding(bobClient, 'not-a-uuid')).rejects.toMatchObject({ code: '22P02' })
  })
})
