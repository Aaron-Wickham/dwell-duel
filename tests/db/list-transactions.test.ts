import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { encodeCursor, readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestMarket, createTestTask, type Member } from './fixtures'

let admin: Member
let bob: Member

const FIRST: PageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[admin, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
})

// `count` adjustments on Bob, straight into the ledger (paging never reads a balance), a minute
// apart from 1 January, each run of five sharing one microsecond timestamp. With Alice's and Bob's
// starting grants on top, both the 50th/51st and the 100th/101st rows fall inside a tie.
async function insertLedgerRows(count: number): Promise<void> {
  const start = Date.parse('2026-01-01T00:00:00.000Z')
  const rows = Array.from({ length: count }, (_, i) => ({
    profile_id: bob.id,
    amount: i + 1,
    type: 'admin_adjustment',
    meta: { reason: `Row ${i}` },
    created_at: `${new Date(start + Math.floor(i / 5) * 60_000).toISOString().slice(0, 19)}.456123+00:00`,
  }))
  const { error } = await serviceClient().from('coin_transactions').insert(rows)
  if (error) throw error
}

// Every ledger row, newest first, as the service role sees it: the order paging must reproduce.
async function allIdsNewestFirst(): Promise<number[]> {
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('id')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data.map((r) => r.id as number)
}

// Follows the page's "Show more" link the way a click does: build its href, then read the params
// back out of it.
function follow(page: KeysetPage<LedgerEntry>, searchParams: SearchParams): SearchParams {
  if (!page.next) throw new Error('expected a next page')
  const href = new URL(showMoreHref('/admin/ledger', searchParams, 'before', page.next), 'http://localhost')
  return Object.fromEntries(href.searchParams)
}

describe('listAllTransactions', () => {
  let adminClient: SupabaseClient

  beforeEach(async () => {
    adminClient = await clientFor(admin)
    await ensureInvited(adminClient)
  })

  it("carries each entry's member id alongside their name", async () => {
    const { rows } = await listAllTransactions(adminClient, FIRST)

    expect(rows).toContainEqual(
      expect.objectContaining({ profileId: bob.id, memberName: 'Bob', amount: 100, type: 'Starting grant', context: 'Starting grant' }),
    )
  })

  it('builds a context line for a bet, a bet win and an approved task from their meta ids', async () => {
    const { taskId } = await createTestTask(admin, { title: 'Read Genesis 1-3', rewardAmount: 10 })
    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    const { error: approveErr } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId as string })
    expect(approveErr).toBeNull()

    const { marketId, outcomeIds } = await createTestMarket(adminClient, ['Yes', 'No'], { title: 'Will it rain?' })
    const { error: betErr } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 20,
    })
    expect(betErr).toBeNull()

    // Admin created and can resolve immediately, since an admin caller skips the close_at wait.
    const { error: resolveErr } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(resolveErr).toBeNull()

    const { rows } = await listAllTransactions(adminClient, FIRST)

    expect(rows).toContainEqual(expect.objectContaining({ context: 'Task approved: Read Genesis 1-3' }))
    expect(rows).toContainEqual(expect.objectContaining({ context: 'Bet on Yes in Will it rain?' }))
    expect(rows).toContainEqual(expect.objectContaining({ context: 'Bet won: Will it rain?' }))
  })

  it('pages 50 at a time, and each Show more extends the range with nothing skipped or repeated', async () => {
    await insertLedgerRows(120)
    const everything = await allIdsNewestFirst()
    expect(everything).toHaveLength(122)

    const first = await listAllTransactions(adminClient, FIRST)
    expect(first.rows.map((e) => e.id)).toEqual(everything.slice(0, 50))
    expect(first.windowed).toBe(false)
    expect(first.next?.kind).toBe('extend')

    const secondParams = follow(first, {})
    const second = await listAllTransactions(adminClient, readPageParams(secondParams, 'before'))
    expect(second.rows.map((e) => e.id)).toEqual(everything.slice(0, 100))
    expect(second.next?.kind).toBe('extend')

    const third = await listAllTransactions(adminClient, readPageParams(follow(second, secondParams), 'before'))
    expect(third.rows.map((e) => e.id)).toEqual(everything)
    expect(third.next).toBeNull()
  })

  it('starts a fresh window past 500 rows, with every row reachable exactly once', async () => {
    await insertLedgerRows(560)
    const everything = await allIdsNewestFirst()
    expect(everything).toHaveLength(562)

    let params: SearchParams = {}
    let page = await listAllTransactions(adminClient, FIRST)
    while (page.next?.kind === 'extend') {
      params = follow(page, params)
      page = await listAllTransactions(adminClient, readPageParams(params, 'before'))
    }
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(0, 500))
    expect(page.next?.kind).toBe('window')

    params = follow(page, params)
    expect(Object.keys(params)).toEqual(['before_from'])
    page = await listAllTransactions(adminClient, readPageParams(params, 'before'))
    expect(page.windowed).toBe(true)
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(500, 550))

    params = follow(page, params)
    page = await listAllTransactions(adminClient, readPageParams(params, 'before'))
    expect(page.windowed).toBe(true)
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(500))
    expect(page.next).toBeNull()
  })

  it('reads a garbage cursor, or one whose id is not a ledger id, as the first page instead of failing', async () => {
    await insertLedgerRows(60)
    const everything = await allIdsNewestFirst()
    const wrongId = readPageParams({ before: encodeCursor({ ts: '2026-01-01T00:00:00Z', id: 'bet:1' }) }, 'before')
    expect(wrongId.bottom).not.toBeNull()

    for (const page of [readPageParams({ before: 'garbage' }, 'before'), wrongId]) {
      const result = await listAllTransactions(adminClient, page)
      expect(result.rows.map((e) => e.id)).toEqual(everything.slice(0, 50))
      expect(result.windowed).toBe(false)
    }
  })
})
