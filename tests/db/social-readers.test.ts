import { describe, it, expect, beforeEach } from 'vitest'
import { type TestClient, setBalanceViaLedger } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, createTestTask, ensureInvited, type Member, giveRole, backLeg } from './fixtures'
import { pgQuery } from './pg-query'
import { listFeed } from '@/lib/social/list-feed'
import { getLeaderboardPage, getMemberStanding } from '@/lib/social/leaderboard'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

const NO_PAGE: PageParams = { top: null, bottom: null }

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

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
  }, 30_000)

  it('joins a parlay’s leg count and a task’s title through activity_events', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Parlay market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Parlay market B' })
    expect((await aliceClient.rpc('place_bet', { p_market_id: a.marketId, p_outcome_id: a.outcomeIds[0], p_amount: 5 })).error).toBeNull()
    expect((await aliceClient.rpc('place_bet', { p_market_id: b.marketId, p_outcome_id: b.outcomeIds[0], p_amount: 5 })).error).toBeNull()
    for (const market of [a, b]) await backLeg(market, 1)
    expect(
      (await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })).error,
    ).toBeNull()

    await giveRole(alice, 'admin')
    const { taskId } = await createTestTask(alice, { title: 'Read Psalm 23', rewardAmount: 9 })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    const { rows } = await listFeed(bobClient, { actorId: bob.id, page: NO_PAGE })
    expect(rows).toContainEqual(expect.objectContaining({ kind: 'parlay_placed', actorId: bob.id, amount: 10, legCount: 2 }))
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'task_completed', actorId: bob.id, taskTitle: 'Read Psalm 23', amount: 9 }),
    )
  })

  // activity_feed (the view 0035 leaves in place) recomputes every row from source tables on
  // every read, so it never consults activity_events.hidden_at. Hiding a row directly here, with
  // no matching write to any source table, only shows through listFeed once it reads
  // activity_events itself, so this proves the swap happened. service_role can only select from
  // activity_events, so the hide goes through pgQuery as the table's owner.
  it('excludes an event once its hidden_at is set on activity_events', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Hide-me market' })

    const before = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(before.rows.map((e) => e.kind)).toEqual(['market_created'])

    await pgQuery(
      `update public.activity_events set hidden_at = now() where market_id = '${market.marketId}' and kind = 'market_created'`,
    )

    const after = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(after.rows).toEqual([])
  })
})

describe('getLeaderboardPage', () => {
  it('ranks every member by net worth, sharing ranks on ties', async () => {
    const carol = await makeMember('Carol')
    // Only invited members are ranked (0086).
    await ensureInvited(await clientFor(carol))
    await setBalanceViaLedger(alice.id, 150)
    await setBalanceViaLedger(bob.id, 150)
    await setBalanceViaLedger(carol.id, 90)

    const board = await getLeaderboardPage(bobClient, 'all', { top: null, bottom: null })
    expect(board.rows.map((m) => [m.displayName, m.score, m.rank])).toEqual([
      ['Alice', 150, 1],
      ['Bob', 150, 1],
      ['Carol', 90, 3],
    ])
    expect(board.next).toBeNull()
  })

  it('is empty for an uninvited session', async () => {
    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getLeaderboardPage(carolClient, 'all', { top: null, bottom: null })).toEqual({ rows: [], next: null, windowed: false })
    expect(await getLeaderboardPage(carolClient, 'month', { top: null, bottom: null })).toEqual({ rows: [], next: null, windowed: false })
  })
})

describe('getMemberStanding', () => {
  it('ranks on the net-worth board, and counts the total membership', async () => {
    const carol = await makeMember('Carol')
    await ensureInvited(await clientFor(carol))
    await setBalanceViaLedger(alice.id, 150)
    await setBalanceViaLedger(bob.id, 90)
    await setBalanceViaLedger(carol.id, 90)

    const standing = await getMemberStanding(bobClient, bob.id)
    expect(standing).toMatchObject({ id: bob.id, displayName: 'Bob', balance: 90, score: 90, rank: 2, memberCount: 3 })
  })

  it('returns null for a well-formed id that matches no profile — the member page’s real 404', async () => {
    expect(await getMemberStanding(bobClient, '00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('throws on a malformed id instead of silently matching nothing, which is why the page checks isUuid first', async () => {
    await expect(getMemberStanding(bobClient, 'not-a-uuid')).rejects.toMatchObject({ code: '22P02' })
  })
})
