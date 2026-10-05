import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, giveRole, backLeg, type Member, type TestMarket } from './fixtures'
import { listMatchingMarkets, listOpenMarkets, listResolvedMarkets } from '@/lib/markets/list-markets'
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

const titles = async (client: SupabaseClient, q: string, categoryId: string | null = null) =>
  (await listMatchingMarkets(client, FIRST, { q, categoryId })).rows.map((m) => m.title)

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex = 0): Promise<void> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex], p_amount: 5 })
  if (error) throw error
}

describe('listMatchingMarkets: search', () => {
  it('matches a title case-insensitively anywhere in it, newest first', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it RAIN tomorrow?' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Potluck headcount' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Brain teaser winner' })

    expect(await titles(bobClient, 'rain')).toEqual(['Brain teaser winner', 'Will it RAIN tomorrow?'])
    expect(await titles(bobClient, 'POTLUCK')).toEqual(['Potluck headcount'])
    expect(await titles(bobClient, 'zzz')).toEqual([])
  })

  it('treats LIKE wildcards, backslashes and filter syntax in the search as plain text', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: '100% sure' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Ten plus one' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'snake_case wins' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Back\\slash' })

    expect(await titles(bobClient, '%')).toEqual(['100% sure'])
    expect(await titles(bobClient, '_')).toEqual(['snake_case wins'])
    expect(await titles(bobClient, 'e_c')).toEqual(['snake_case wins'])
    expect(await titles(bobClient, '\\')).toEqual(['Back\\slash'])
    // Not a pattern, so it matches nothing rather than everything, and nothing throws.
    for (const q of ['a),status.eq.open,(b', '"', '.', ',', 'x%_\\']) {
      await expect(titles(bobClient, q)).resolves.toEqual([])
    }
  })

  it('finds a match in every status (#389)', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match open', closeInMs: 3_600_000 })
    const awaiting = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match awaiting' })
    const done = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match done' })
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Match voided' })
    const db = serviceClient()
    const past = new Date(Date.now() - 1000).toISOString()
    for (const m of [awaiting, done]) await db.from('markets').update({ close_at: past }).eq('id', m.marketId)
    const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Done', p_market_id: done.marketId, p_outcome_id: done.outcomeIds[0] })
    if (error) throw error
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId, p_reason: 'Asked twice' })
    if (voidErr) throw voidErr

    expect((await titles(bobClient, 'Match')).sort()).toEqual(['Match awaiting', 'Match done', 'Match open', 'Match voided'])
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
    const first = await listMatchingMarkets(bobClient, FIRST, { q: 'Paged' })
    expect(first.rows).toHaveLength(50)
    expect(first.next?.kind).toBe('extend')
    expect(first.rows[0].title).toBe('Paged 00')
  })
})

describe('market lists: category (#327)', () => {
  async function inCategory(title: string, category: string, closeInMs = 3_600_000): Promise<string> {
    const { data, error } = await aliceClient.rpc('create_market_v4', {
      p_title: title,
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: new Date(Date.now() + closeInMs).toISOString(),
      p_category: category,
    })
    if (error) throw error
    return (data as { market_id: string }).market_id
  }

  it('narrows the open, resolved and matching lists to one category, and names each market’s category', async () => {
    await inCategory('Sunny Sunday', 'Weather')
    await inCategory('Rainy Monday', 'Weather')
    await inCategory('Cup final', 'Sports')
    const done = await inCategory('Snow last week', 'Weather')
    const { error } = await aliceClient.rpc('void_market', { p_market_id: done, p_reason: 'Asked twice' })
    if (error) throw error
    const { data: weather } = await serviceClient().from('market_categories').select('id').eq('slug', 'weather').single()

    const open = await listOpenMarkets(bobClient, FIRST, { upcoming: true, at: NOW() }, { categoryId: weather!.id })
    expect(open.rows.map((m) => m.title).sort()).toEqual(['Rainy Monday', 'Sunny Sunday'])
    expect(open.rows[0].category).toEqual({ name: 'Weather', slug: 'weather' })
    const resolved = await listResolvedMarkets(bobClient, FIRST, { categoryId: weather!.id })
    expect(resolved.rows.map((m) => m.title)).toEqual(['Snow last week'])
    expect(await titles(bobClient, 'day', weather!.id)).toEqual(['Rainy Monday', 'Sunny Sunday'])
    expect(await titles(bobClient, 'day')).toEqual(['Rainy Monday', 'Sunny Sunday'])
    expect(await titles(bobClient, 'final', weather!.id)).toEqual([])
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
    expect(results.rows.every((e) => ['market_resolved', 'market_voided', 'bet_won', 'parlay_won', 'season_champion'].includes(e.kind))).toBe(true)
  })

  it('Results includes voids, since a void is how a market ended', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided one' })
    const { error } = await aliceClient.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Asked twice' })
    if (error) throw error

    const results = await listFeed(bobClient, { page: FIRST, show: 'results' })
    expect(results.rows.map((e) => `${e.kind}:${e.marketTitle ?? ''}`)).toContain('market_voided:Voided one')
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

  it('Mine includes voids of markets the member has a stake in or made, by whoever voided them, and no others', async () => {
    const betOn = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob bet, voided' })
    const legA = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob leg, voided' })
    const legB = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Bob other leg' })
    const made = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Bob made, voided' })
    const notHis = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Not Bob’s, voided' })
    await bet(bobClient, betOn)
    // A parlay leg needs other members' money on its market (0074).
    for (const leg of [legA, legB]) await backLeg(leg, 1)
    const { error: parlayErr } = await bobClient.rpc('place_parlay', { p_outcome_ids: [legA.outcomeIds[0], legB.outcomeIds[0]], p_stake: 3 })
    if (parlayErr) throw parlayErr
    // Alice is an admin, so she voids all of them, Bob's own market included.
    for (const m of [betOn, legA, made, notHis]) {
      const { error } = await aliceClient.rpc('void_market', { p_market_id: m.marketId, p_reason: 'Asked twice' })
      if (error) throw error
    }

    const mine = await listFeed(bobClient, { page: FIRST, show: 'mine' })
    const voids = mine.rows.filter((e) => e.kind === 'market_voided').map((e) => e.marketTitle)
    expect(voids.sort()).toEqual(['Bob bet, voided', 'Bob leg, voided', 'Bob made, voided'])
    // No event comes back from two branches.
    expect(new Set(mine.rows.map((e) => e.id)).size).toBe(mine.rows.length)
  })

  it('lists a void once when the member both made the market and bet on it', async () => {
    const market = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Made and bet' })
    await bet(bobClient, market)
    const { error } = await aliceClient.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Asked twice' })
    if (error) throw error

    const mine = await listFeed(bobClient, { page: FIRST, show: 'mine' })
    expect(mine.rows.filter((e) => e.kind === 'market_voided' && e.marketTitle === 'Made and bet')).toHaveLength(1)
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

  it('reads Mine through indexes, not by walking the whole feed, with a realistic number of events', async () => {
    // Bob has most of the feed; Alice has ten events and a stake in one resolved market, so a
    // per-row test would have to walk everything newer than her tenth event to fill a page.
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Mine plan' })
    await bet(aliceClient, market)
    await pgQuery(
      `insert into public.activity_events (id, kind, occurred_at, actor_id)
         select 'seed:b:' || g, 'task_completed', now() - g * interval '1 minute', '${bob.id}' from generate_series(1, 30000) g;
       insert into public.activity_events (id, kind, occurred_at, actor_id)
         select 'seed:a:' || g, 'task_completed', now() - g * interval '2 days', '${alice.id}' from generate_series(1, 10) g;
       -- A target of 1000 samples 300,000 rows, more than the table holds, so analyze reads it all
       -- and Alice's estimate is exact every run; a sampled one sometimes made a Seq Scan cheaper (#358).
       alter table public.activity_events alter column actor_id set statistics 1000;
       analyze public.activity_events;
       alter table public.activity_events alter column actor_id set statistics -1;`,
    )
    const rows = await pgQuery<{ 'QUERY PLAN': string }>(
      `set local request.jwt.claims = '{"sub":"${alice.id}","role":"authenticated"}';
       explain select id from public.my_activity_events()
         where hidden_at is null and occurred_at <= now() + interval '1 day'
         order by occurred_at desc, id desc limit 51`,
    )
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n')
    expect(plan).not.toMatch(/Seq Scan on activity_events/)
    expect(plan).not.toMatch(/activity_events_feed_idx/)
    expect(plan).toMatch(/activity_events_actor_id_idx|activity_events_actor_idx/)
  })
})
