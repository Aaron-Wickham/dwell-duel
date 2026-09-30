import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listMyTransactions, type MyCoinEntry } from '@/lib/ledger/my-transactions'
import { readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetPage } from '@/lib/pagination/keyset'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestMarket, createTestTask, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member
let bobClient: SupabaseClient

const FIRST: PageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  await giveRole(alice, 'admin')
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

// `count` adjustments each for Bob and Alice, interleaved, straight into the ledger (paging never
// reads a balance), a minute apart from 1 January, each run of five sharing one microsecond
// timestamp, so page boundaries fall inside ties and Alice's rows sit between Bob's.
async function insertInterleavedRows(count: number): Promise<void> {
  const start = Date.parse('2026-01-01T00:00:00.000Z')
  const rows = Array.from({ length: count }, (_, i) => ({
    amount: i + 1,
    type: 'admin_adjustment',
    meta: { reason: `Row ${i}` },
    created_at: `${new Date(start + Math.floor(i / 5) * 60_000).toISOString().slice(0, 19)}.456123+00:00`,
  })).flatMap((row) => [
    { ...row, profile_id: bob.id },
    { ...row, profile_id: alice.id },
  ])
  const { error } = await serviceClient().from('coin_transactions').insert(rows)
  if (error) throw error
}

// One member's ledger rows, newest first, as the service role sees them: the order paging must reproduce.
async function idsNewestFirst(profileId: string): Promise<number[]> {
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data.map((r) => r.id as number)
}

function follow(page: KeysetPage<MyCoinEntry>, searchParams: SearchParams): SearchParams {
  if (!page.next) throw new Error('expected a next page')
  const href = new URL(showMoreHref('/bets', searchParams, 'coins', page.next), 'http://localhost')
  return Object.fromEntries(href.searchParams)
}

describe('listMyTransactions', () => {
  it('labels each of your own movements in plain words', async () => {
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { taskId } = await createTestTask(alice, { title: 'Read Ruth', rewardAmount: 10 })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    const { error: approveErr } = await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })
    expect(approveErr).toBeNull()

    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Will it rain?' })
    const { error: betErr } = await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    expect(betErr).toBeNull()
    const { error: resolveErr } = await aliceClient.rpc('resolve_market', {
      p_note: 'Resolved in a test',
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
    })
    expect(resolveErr).toBeNull()

    const { rows } = await listMyTransactions(bobClient, bob.id, FIRST)

    // An unseeded market with Bob its only bettor pays his stake straight back.
    expect(rows.map((e) => [e.label, e.amount])).toEqual([
      ['Won 20 DC on Will it rain?', 20],
      ['Bet 20 DC on Yes · Will it rain?', -20],
      ['Task reward: Read Ruth', 10],
      ['Starting balance', 100],
    ])
  })

  it("returns only the reader's own rows, even to an admin whose RLS reads everyone's", async () => {
    await insertInterleavedRows(10)
    const aliceClient = await clientFor(alice)

    const bobs = await listMyTransactions(bobClient, bob.id, FIRST)
    expect(bobs.rows.map((e) => e.id)).toEqual(await idsNewestFirst(bob.id))

    const alices = await listMyTransactions(aliceClient, alice.id, FIRST)
    expect(alices.rows.map((e) => e.id)).toEqual(await idsNewestFirst(alice.id))
  })

  it("shows a member nothing when asked for someone else's history", async () => {
    await insertInterleavedRows(10)

    const { rows } = await listMyTransactions(bobClient, alice.id, FIRST)
    expect(rows).toEqual([])
  })

  it('pages 50 at a time, newest first, with nothing skipped or repeated', async () => {
    await insertInterleavedRows(120)
    const everything = await idsNewestFirst(bob.id)
    expect(everything).toHaveLength(121)

    const first = await listMyTransactions(bobClient, bob.id, FIRST)
    expect(first.rows.map((e) => e.id)).toEqual(everything.slice(0, 50))
    expect(first.windowed).toBe(false)
    expect(first.next?.kind).toBe('extend')

    const secondParams = follow(first, { tab: 'coins' })
    const second = await listMyTransactions(bobClient, bob.id, readPageParams(secondParams, 'coins'))
    expect(second.rows.map((e) => e.id)).toEqual(everything.slice(0, 100))

    const third = await listMyTransactions(bobClient, bob.id, readPageParams(follow(second, secondParams), 'coins'))
    expect(third.rows.map((e) => e.id)).toEqual(everything)
    expect(third.next).toBeNull()
  })

  it('starts a fresh window past 500 rows, with every row reachable exactly once', async () => {
    await insertInterleavedRows(560)
    const everything = await idsNewestFirst(bob.id)
    expect(everything).toHaveLength(561)

    let params: SearchParams = { tab: 'coins' }
    let page = await listMyTransactions(bobClient, bob.id, FIRST)
    while (page.next?.kind === 'extend') {
      params = follow(page, params)
      page = await listMyTransactions(bobClient, bob.id, readPageParams(params, 'coins'))
    }
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(0, 500))
    expect(page.next?.kind).toBe('window')

    params = follow(page, params)
    expect(Object.keys(params).sort()).toEqual(['coins_from', 'tab'])
    page = await listMyTransactions(bobClient, bob.id, readPageParams(params, 'coins'))
    expect(page.windowed).toBe(true)
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(500, 550))

    params = follow(page, params)
    page = await listMyTransactions(bobClient, bob.id, readPageParams(params, 'coins'))
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(500))
    expect(page.next).toBeNull()
  })
})
