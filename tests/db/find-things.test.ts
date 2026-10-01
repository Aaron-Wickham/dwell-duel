import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, giveRole, type Member, type TestMarket } from './fixtures'
import { listMatchingMarkets, type MarketNarrow } from '@/lib/markets/list-markets'
import { listFeed } from '@/lib/social/list-feed'
import type { PageParams } from '@/lib/pagination/cursor'
import { pgQuery } from './pg-query'
import { likePattern } from '@/lib/markets/search'

const FIRST: PageParams = { top: null, bottom: null }
const NOW = () => new Date().toISOString()

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  await giveRole(alice, 'admin')
})

const narrow = (member: Member, q: string, mine: MarketNarrow['mine'] = null): MarketNarrow => ({ q, mine, userId: member.id })
const titles = async (client: SupabaseClient, member: Member, q: string, mine: MarketNarrow['mine'] = null, filter: 'all' | 'open' | 'awaiting' | 'resolved' = 'all') =>
  (await listMatchingMarkets(client, FIRST, filter, narrow(member, q, mine), NOW())).rows.map((m) => m.title)

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex = 0): Promise<void> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex], p_amount: 5 })
  if (error) throw error
}

describe('listMatchingMarkets: search', () => {
  it('matches a title case-insensitively anywhere in it, newest first', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it RAIN tomorrow?' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Potluck headcount' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Brain teaser winner' })

    expect(await titles(bobClient, bob, 'rain')).toEqual(['Brain teaser winner', 'Will it RAIN tomorrow?'])
    expect(await titles(bobClient, bob, 'POTLUCK')).toEqual(['Potluck headcount'])
    expect(await titles(bobClient, bob, 'zzz')).toEqual([])
  })

  it('treats LIKE wildcards, backslashes and filter syntax in the search as plain text', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: '100% sure' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Ten plus one' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'snake_case wins' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Back\\slash' })

    expect(await titles(bobClient, bob, '%')).toEqual(['100% sure'])
    expect(await titles(bobClient, bob, '_')).toEqual(['snake_case wins'])
    expect(await titles(bobClient, bob, 'e_c')).toEqual(['snake_case wins'])
    expect(await titles(bobClient, bob, '\\')).toEqual(['Back\\slash'])
    // Not a pattern, so it matches nothing rather than everything, and nothing throws.
    for (const q of ['a),status.eq.open,(b', '"', '.', ',', 'x%_\\']) {
      await expect(titles(bobClient, bob, q)).resolves.toEqual([])
    }
  })

  it('splits by the status tab and keeps resolved and voided markets in one list', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match open', closeInMs: 3_600_000 })
    const awaiting = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match awaiting' })
    const done = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match done' })
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match voided' })
    const db = serviceClient()
    const past = new Date(Date.now() - 1000).toISOString()
    for (const m of [awaiting, done]) await db.from('markets').update({ close_at: past }).eq('id', m.marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Done', p_market_id: done.marketId, p_outcome_id: done.outcomeIds[0] })
    if (error) throw error
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    if (voidErr) throw voidErr

    expect((await titles(bobClient, bob, 'Match')).sort()).toEqual(['Match awaiting', 'Match done', 'Match open', 'Match voided'])
    expect(await titles(bobClient, bob, 'Match', null, 'open')).toEqual(['Match open'])
    expect(await titles(bobClient, bob, 'Match', null, 'awaiting')).toEqual(['Match awaiting'])
    expect((await titles(bobClient, bob, 'Match', null, 'resolved')).sort()).toEqual(['Match done', 'Match voided'])
  })

  it('pages with Show more over a flat list', async () => {
    const db = serviceClient()
    for (let i = 0; i < 53; i++) {
      const { error } = await db.from('markets').insert({
        title: `Paged ${String(i).padStart(2, '0')}`,
        kind: 'binary',
        status: 'open',
        close_at: new Date(Date.now() + 86_400_000).toISOString(),
        created_by: alice.id,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      })
      if (error) throw error
    }
    const first = await listMatchingMarkets(bobClient, FIRST, 'all', narrow(bob, 'Paged'), NOW())
    expect(first.rows).toHaveLength(50)
    expect(first.next?.kind).toBe('extend')
    expect(first.rows[0].title).toBe('Paged 00')
  })
})

describe('listMatchingMarkets: whose markets', () => {
  it('"made" lists the member’s own markets only', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Alice made this' })
    await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Bob made this' })

    expect(await titles(bobClient, bob, '', 'made')).toEqual(['Bob made this'])
    expect(await titles(aliceClient, alice, 'made', 'made')).toEqual(['Alice made this'])
  })

  it('"bet" lists markets the member bet on or has a parlay leg on, settled or not, and never someone else’s', async () => {
    const solo = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob solo' })
    const legA = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob leg A', seed: 10 })
    const legB = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob leg B', seed: 10 })
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Only Alice bets' })
    await bet(bobClient, solo)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [legA.outcomeIds[0], legB.outcomeIds[0]], p_stake: 3 })
    if (error) throw error
    await bet(aliceClient, other)

    expect((await titles(bobClient, bob, '', 'bet')).sort()).toEqual(['Bob leg A', 'Bob leg B', 'Bob solo'])
    expect(await titles(bobClient, bob, 'leg b', 'bet')).toEqual(['Bob leg B'])
    expect(await titles(aliceClient, alice, '', 'bet')).toEqual(['Only Alice bets'])

    // Resolving settles the bet but doesn't take the market out of "I bet on".
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', solo.marketId)
    const { error: resolveErr } = await aliceClient.rpc('resolve_market', { p_note: 'Done', p_market_id: solo.marketId, p_outcome_id: solo.outcomeIds[0] })
    if (resolveErr) throw resolveErr
    expect(await titles(bobClient, bob, 'solo', 'bet', 'resolved')).toEqual(['Bob solo'])
  })
})

describe('listFeed: show', () => {
  it('Results is only results, whoever they are', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Resolved one' })
    await bet(bobClient, market)
    await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', market.marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Done', p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0] })
    if (error) throw error

    const all = await listFeed(bobClient, { page: FIRST })
    const results = await listFeed(bobClient, { page: FIRST, show: 'results' })
    expect(all.rows.some((e) => e.kind === 'bet_placed')).toBe(true)
    expect(results.rows.length).toBeGreaterThan(0)
    expect(results.rows.every((e) => ['market_resolved', 'bet_won', 'parlay_won', 'season_champion'].includes(e.kind))).toBe(true)
  })

  it('Mine is the member’s own events plus results on markets they have a stake in', async () => {
    const shared = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Both bet' })
    const alicesOnly = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Alice only' })
    await bet(bobClient, shared)
    await bet(aliceClient, alicesOnly)
    const db = serviceClient()
    for (const m of [shared, alicesOnly]) {
      await db.from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', m.marketId)
      const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Done', p_market_id: m.marketId, p_outcome_id: m.outcomeIds[1] })
      if (error) throw error
    }

    const mine = await listFeed(bobClient, { page: FIRST, show: 'mine' })
    const summary = mine.rows.map((e) => `${e.kind}:${e.marketTitle ?? ''}:${e.actorId === bob.id ? 'bob' : 'other'}`)
    // Bob's own bet, plus the result of the market he's in, but not Alice's bet, her market's
    // creation, or the result of the market he isn't in.
    expect(summary).toContain('bet_placed:Both bet:bob')
    expect(summary).toContain('market_resolved:Both bet:other')
    expect(summary).not.toContain('market_resolved:Alice only:other')
    expect(mine.rows.filter((e) => e.actorId !== bob.id).every((e) => e.kind === 'market_resolved' && e.marketTitle === 'Both bet')).toBe(true)
  })
})

describe('the title search index', () => {
  it('serves an ilike on a title through the trigram index', async () => {
    // Seq scans are priced out: a fixture this small would otherwise always scan, whatever the indexes.
    const pattern = likePattern('potluck').replace(/'/g, "''")
    const rows = await pgQuery<{ 'QUERY PLAN': string }>(
      `set local enable_seqscan = off; explain select id from public.markets where title ilike '${pattern}'`,
    )
    expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('markets_title_trgm_idx')
  })
})
