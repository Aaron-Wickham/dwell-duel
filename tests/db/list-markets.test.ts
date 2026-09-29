import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { countOpenMarkets, listResolvedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { encodeCursor, readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

const FIRST: PageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function closeNow(marketId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', marketId)
  if (error) throw error
}

async function resolve(marketId: string, outcomeId: string): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: outcomeId })
  if (error) throw error
}

async function voidMarket(marketId: string): Promise<void> {
  const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId })
  if (error) throw error
}

describe('listOpenMarkets', () => {
  it('lists only open markets, soonest to close first, awaiting ones included, with no resolution time', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Closes later', closeInMs: 3 * 86_400_000 })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Closes soon', closeInMs: 3_600_000 })
    const awaiting = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Awaiting' })
    await closeNow(awaiting.marketId)
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Closes tomorrow', closeInMs: 86_400_000 })
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided', closeInMs: 60_000 })
    await voidMarket(voided.marketId)

    const { rows: markets, next } = await listOpenMarkets(bobClient, FIRST)

    expect(markets.map((m) => m.title)).toEqual(['Awaiting', 'Closes soon', 'Closes tomorrow', 'Closes later'])
    expect(markets.every((m) => m.status === 'open' && m.resolvedAt === null && m.resolvedOutcomeLabel === null)).toBe(true)
    expect(markets.map((m) => m.id)).not.toContain(voided.marketId)
    expect(next).toBeNull()
  })

  it("orders a market's outcomes by label when they tie on creation time, regardless of input order", async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Zebra', 'Apple', 'Mango'])

    const { rows } = await listOpenMarkets(bobClient, FIRST)
    const market = rows.find((m) => m.id === marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it("orders a market's outcomes by creation time before label, even when that disagrees with alphabetical order", async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Alpha', 'Beta'])
    // create_market() inserts every outcome in one transaction, so they normally tie on
    // created_at. Backdating one simulates the untied case and proves created_at wins.
    await serviceClient()
      .from('market_outcomes')
      .update({ created_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', outcomeIds[1])

    const { rows } = await listOpenMarkets(bobClient, FIRST)
    const market = rows.find((m) => m.id === marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Beta', 'Alpha'])
  })

  it('is empty for an uninvited session', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const carol = await makeMember('Carol')
    expect(await listOpenMarkets(await clientFor(carol), FIRST)).toEqual({ rows: [], next: null, windowed: false })
  })

  it('pages 50 at a time across a close_at tie, broken by id, and a fresh window starts inside the tie', async () => {
    const start = Date.parse('2026-12-01T00:00:00.000Z')
    // Inserted directly, as the resolved list's paging test does. Markets share a close_at in
    // pairs offset by one, so the 50th and 51st soonest tie and only the id orders them; each
    // created_at runs the other way, so the list can't pass by reading creation order.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      created_by: alice.id,
      title: `Open ${String(i).padStart(2, '0')}`,
      kind: 'binary',
      status: 'open',
      close_at: `${new Date(start + Math.floor((i + 1) / 2) * 60_000).toISOString().slice(0, 19)}.000456+00:00`,
      created_at: new Date(Date.parse('2026-09-01T00:00:00.000Z') - i * 60_000).toISOString(),
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error
    const { data: all, error: allErr } = await serviceClient()
      .from('markets')
      .select('id, close_at')
      .order('close_at', { ascending: true })
      .order('id', { ascending: true })
    if (allErr) throw allErr
    const everything = all.map((m) => m.id as string)
    expect(all[49].close_at).toBe(all[50].close_at)

    const first = await listOpenMarkets(bobClient, FIRST)
    expect(first.rows.map((m) => m.id)).toEqual(everything.slice(0, 50))
    expect(first.next).toMatchObject({ kind: 'extend', firstId: everything[50] })

    const href = new URL(showMoreHref('/markets', {}, 'open', first.next!), 'http://localhost')
    const second = await listOpenMarkets(bobClient, readPageParams(Object.fromEntries(href.searchParams), 'open'))
    expect(second.rows.map((m) => m.id)).toEqual(everything)
    expect(new Set(second.rows.map((m) => m.id)).size).toBe(60)
    expect(second.next).toBeNull()

    const window = await listOpenMarkets(
      bobClient,
      readPageParams({ open_from: encodeCursor({ ts: all[50].close_at, id: everything[50] }) }, 'open'),
    )
    expect(window.windowed).toBe(true)
    expect(window.rows.map((m) => m.id)).toEqual(everything.slice(50))
  })

  it('reads a fresh window past the last open market to close as empty', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const pastTheEnd = encodeCursor({ ts: '2999-01-01T00:00:00Z', id: '00000000-0000-4000-8000-000000000000' })
    expect(await listOpenMarkets(bobClient, readPageParams({ open_from: pastTheEnd }, 'open'))).toEqual({
      rows: [],
      next: null,
      windowed: true,
    })
  })
})

describe('listResolvedMarkets', () => {
  it('dates the current resolution, from the embedded join', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    await closeNow(marketId)
    await resolve(marketId, outcomeIds[0])

    const { data: resolution, error: resolutionErr } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', marketId)
      .single()
    if (resolutionErr) throw resolutionErr

    const { rows } = await listResolvedMarkets(bobClient, FIRST)
    const market = rows.find((m) => m.id === marketId)
    expect(market?.status).toBe('resolved')
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe(resolution.resolved_at)
  })

  it('shows the current resolution after an override, not the reversed one', async () => {
    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    await resolve(marketId, outcomeIds[0])
    await resolve(marketId, outcomeIds[1])

    const { rows } = await listResolvedMarkets(bobClient, FIRST)
    expect(rows.find((m) => m.id === marketId)?.resolvedOutcomeLabel).toBe('No')
  })

  it('lists resolved and voided markets as one list, newest first, and no open ones', async () => {
    const resolved = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Resolved' })
    await closeNow(resolved.marketId)
    await resolve(resolved.marketId, resolved.outcomeIds[0])
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided' })
    await voidMarket(voided.marketId)
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Still open' })

    const page = await listResolvedMarkets(bobClient, FIRST)

    expect(page.rows.map((m) => [m.title, m.status, m.resolvedOutcomeLabel])).toEqual([
      ['Voided', 'voided', null],
      ['Resolved', 'resolved', 'Yes'],
    ])
    expect(page.next).toBeNull()
  })

  it('pages 50 at a time, with nothing skipped or repeated across a tie', async () => {
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: sixty create/void round trips are slow, and the list never reads outcomes'
    // pools. Pairs share a created_at, offset by one, so the 50th/51st tie and the id breaks it.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      created_by: alice.id,
      title: `Closed ${String(i).padStart(2, '0')}`,
      kind: 'binary',
      status: 'voided',
      close_at: new Date(start).toISOString(),
      created_at: `${new Date(start + Math.floor((i + 1) / 2) * 60_000).toISOString().slice(0, 19)}.000456+00:00`,
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error
    const { data: all, error: allErr } = await serviceClient()
      .from('markets')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (allErr) throw allErr
    const everything = all.map((m) => m.id as string)
    expect(all[49].created_at).toBe(all[50].created_at)

    const first = await listResolvedMarkets(bobClient, FIRST)
    expect(first.rows.map((m) => m.id)).toEqual(everything.slice(0, 50))
    expect(first.next?.kind).toBe('extend')

    const href = new URL(showMoreHref('/markets', {}, 'resolved', first.next!), 'http://localhost')
    const second = await listResolvedMarkets(bobClient, readPageParams(Object.fromEntries(href.searchParams), 'resolved'))
    expect(second.rows.map((m) => m.id)).toEqual(everything)
    expect(second.next).toBeNull()
  })
})

describe('countOpenMarkets', () => {
  it('counts open markets, awaiting ones included, and not resolved or voided ones', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const awaiting = await createTestMarket(aliceClient, ['Yes', 'No'])
    await closeNow(awaiting.marketId)
    const resolved = await createTestMarket(aliceClient, ['Yes', 'No'])
    await closeNow(resolved.marketId)
    await resolve(resolved.marketId, resolved.outcomeIds[0])
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'])
    await voidMarket(voided.marketId)

    expect(await countOpenMarkets(bobClient)).toBe(2)
  })

  it('is 0 for an uninvited session', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const carol = await makeMember('Carol')
    expect(await countOpenMarkets(await clientFor(carol))).toBe(0)
  })
})
