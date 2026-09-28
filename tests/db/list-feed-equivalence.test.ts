import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import {
  seedMembers,
  makeMember,
  clientFor,
  createTestMarket,
  createTestTask,
  ensureInvited,
  type Member,
  type TestMarket,
} from './fixtures'
import { listFeed } from '@/lib/social/list-feed'
import { readKeyset, type KeysetPage } from '@/lib/pagination/keyset'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'
import type { FeedEvent, FeedKind } from '@/lib/social/describe-event'

const NO_PAGE: PageParams = { top: null, bottom: null }

// legacyListFeed is lib/social/list-feed.ts's body at 8207124, the commit Task 1 left behind and
// the last one before Task 2 moved listFeed from the activity_feed view onto activity_events --
// `git show 8207124:lib/social/list-feed.ts`. Kept here rather than imported, since the source
// file no longer has this shape; this is the reference the activity_events-backed listFeed must
// stay equivalent to, so later work can't quietly drift the two apart. Since 0036 no member can
// select the view, so the reference reads it through the service role: the view is
// security_invoker, and the service role bypasses RLS, so it sees every row, exactly what an
// invited member saw through the view before the revoke.
interface LegacyFeedRow {
  id: string
  kind: FeedKind
  occurred_at: string
  actor_id: string
  actor_name: string
  market_id: string | null
  market_title: string | null
  outcome_label: string | null
  amount: number | null
  leg_count: number | null
  task_title: string | null
}

const LEGACY_FEED_COLUMNS =
  'id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title'
const LEGACY_FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

function legacyToFeedEvent(r: LegacyFeedRow): FeedEvent {
  return {
    id: r.id,
    kind: r.kind,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    marketId: r.market_id,
    marketTitle: r.market_title,
    outcomeLabel: r.outcome_label,
    amount: r.amount,
    legCount: r.leg_count,
    taskTitle: r.task_title,
  }
}

async function legacyListFeed(
  supabase: SupabaseClient,
  opts: { actorId?: string; page: PageParams },
): Promise<KeysetPage<FeedEvent>> {
  const fetchRows = async (filter: string | null, limit: number): Promise<LegacyFeedRow[]> => {
    let query = supabase
      .from('activity_feed')
      .select(LEGACY_FEED_COLUMNS)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as LegacyFeedRow[]
  }

  const { rows, next, windowed } = await readKeyset<LegacyFeedRow>(
    opts.page,
    LEGACY_FEED_KEY_COLUMNS,
    fetchRows,
    (row) => ({ ts: row.occurred_at, id: row.id }),
  )

  return { rows: rows.map(legacyToFeedEvent), next, windowed }
}

let alice: Member
let bob: Member
let carol: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let carolClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  for (const client of [aliceClient, bobClient, carolClient]) await ensureInvited(client)
  // Alice is an admin so she can resolve before close_at, override and void.
  const { error } = await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
  if (error) throw error
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

describe('listFeed vs the pre-activity_events view', () => {
  it("matches legacyListFeed's rows for the whole feed, one actor's activity and a second page, and shows an uninvited session nothing", async () => {
    // Every kind: bets, a parlay, a resolve then an override, a parlay win, a void, and an
    // approved task -- the same shape tests/db/activity-events.test.ts's fullScenario proves
    // activity_events keeps in step with activity_feed for, so listFeed's own read of each table
    // is what's compared here.
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Equivalence A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Equivalence B' })
    await bet(bobClient, a, 0, 11)
    await bet(carolClient, a, 1, 30)
    await bet(bobClient, b, 0, 4)
    await bet(carolClient, b, 1, 6)

    const { error: parlayBobErr } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(parlayBobErr).toBeNull()
    const { error: parlayCarolErr } = await carolClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]],
      p_stake: 5,
    })
    expect(parlayCarolErr).toBeNull()

    // Resolve A to Yes: bob's leg wins.
    await resolve(a, 0)
    // Void B: both parlays settle on A alone -- bob's parlay wins, carol's loses.
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(voidErr).toBeNull()
    // Override A to No: claws back A's payouts and reverses bob's parlay win; carol's parlay,
    // whose A leg now wins, wins in its place.
    await resolve(a, 1)

    const { taskId } = await createTestTask(alice, { title: 'Equivalence task', rewardAmount: 9 })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    // Padding, past the 50-row page size, so the whole feed's first page has a next cursor: a
    // second market_created event per market is the cheapest way to add rows both readers agree on.
    for (let i = 0; i < 55; i++) {
      await createTestMarket(aliceClient, ['Yes', 'No'], { title: `Equivalence padding ${i}` })
    }

    const viewerAll = await listFeed(bobClient, { page: NO_PAGE })
    const legacyAll = await legacyListFeed(serviceClient(), { page: NO_PAGE })
    expect(viewerAll.rows.length).toBe(50)
    expect(viewerAll.next).not.toBeNull()
    expect(viewerAll).toEqual(legacyAll)

    const viewerActor = await listFeed(bobClient, { actorId: bob.id, page: NO_PAGE })
    const legacyActor = await legacyListFeed(serviceClient(), { actorId: bob.id, page: NO_PAGE })
    expect(viewerActor.rows.length).toBeGreaterThan(0)
    expect(viewerActor).toEqual(legacyActor)

    // The cursor means "down to and including this row", read through the same
    // showMoreHref/readPageParams round trip a real "Show more" link uses.
    const href = new URL(showMoreHref('/feed', {}, 'activity', viewerAll.next!), 'http://localhost')
    const page2 = readPageParams(Object.fromEntries(href.searchParams), 'activity')
    const viewerPage2 = await listFeed(bobClient, { page: page2 })
    const legacyPage2 = await legacyListFeed(serviceClient(), { page: page2 })
    expect(viewerPage2.rows.length).toBeGreaterThan(0)
    expect(viewerPage2).toEqual(legacyPage2)

    const dave = await makeMember('Dave')
    const daveClient = await clientFor(dave)
    const viewerUninvited = await listFeed(daveClient, { page: NO_PAGE })
    expect(viewerUninvited.rows).toEqual([])
    expect(viewerUninvited.next).toBeNull()
    // The view itself is closed to every member, invited or not, since 0036.
    const { error: viewErr } = await daveClient.from('activity_feed').select('id').limit(1)
    expect(viewErr?.code).toBe('42501')
  })
})
