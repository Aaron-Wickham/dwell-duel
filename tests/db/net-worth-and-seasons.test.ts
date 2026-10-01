import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, setBalanceViaLedger } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backLeg } from './fixtures'
import { pgQuery } from './pg-query'
import { getLeaderboardPage, getMemberStanding } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { getAtStake } from '@/lib/home/at-stake'

let alice: Member
let bob: Member
let carol: Member
let aliceClient: TestClient
let bobClient: TestClient
let carolClient: TestClient

const NO_PAGE = { top: null, bottom: null }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  for (const client of [aliceClient, bobClient, carolClient]) await ensureInvited(client)
  // An admin, so she can resolve before close.
  await giveRole(alice, 'admin')
})

async function bet(client: TestClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex], p_amount: amount })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_note: 'Resolved in a test',
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

type WorthRow = { id: string; balance: number; at_stake: number; score: number; rank: number }

async function netWorth(client: TestClient = bobClient): Promise<Map<string, WorthRow>> {
  const { data, error } = await client.rpc('leaderboard_net_worth').select('id, balance, at_stake, score, rank')
  if (error) throw error
  return new Map((data as WorthRow[]).map((r) => [r.id, r]))
}

// A ledger row written straight into coin_transactions, dated as given. Only the ledger moves, not
// the balance, which is all season_profits reads. A bet_won row without resolve_market's meta is
// skipped by the payout trigger, so no feed event comes with it.
async function ledger(profileId: string, amount: number, type: string, at: string): Promise<void> {
  await pgQuery(
    `insert into public.coin_transactions (profile_id, amount, type, created_at) values ('${profileId}', ${amount}, '${type}', '${at}');
     update public.profiles set balance = balance + ${amount} where id = '${profileId}'`,
  )
}

async function profits(month: string): Promise<Record<string, number>> {
  const rows = await pgQuery<{ profile_id: string; profit: number }>(`select profile_id, profit from public.season_profits('${month}')`)
  return Object.fromEntries(rows.map((r) => [r.profile_id, Number(r.profit)]))
}

async function settle(month: string): Promise<string | null> {
  const { data, error } = await serviceClient().rpc('settle_season', { p_month: month })
  if (error) throw error
  return data as string | null
}

async function championEvents() {
  const { data, error } = await serviceClient()
    .from('activity_events')
    .select('id, kind, occurred_at, actor_id, amount, hidden_at')
    .eq('kind', 'season_champion')
    .order('id')
  if (error) throw error
  return data
}

describe('leaderboard_net_worth', () => {
  it('is balance plus an open solo bet, a pending parlay, and nothing once a market resolves', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })

    await bet(bobClient, a, 0, 30)
    let bobRow = (await netWorth()).get(bob.id)!
    expect(bobRow).toMatchObject({ balance: 70, at_stake: 30, score: 100 })

    for (const market of [a, b]) await backLeg(market, 1)
    const { error: parlayErr } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })
    if (parlayErr) throw parlayErr
    bobRow = (await netWorth()).get(bob.id)!
    expect(bobRow).toMatchObject({ balance: 60, at_stake: 40, score: 100 })
    // Home's At stake and the board read the same stakes.
    expect((await getAtStake(bobClient)).dc).toBe(bobRow.at_stake)

    // A resolves against Bob: his solo stake is gone, and his parlay is lost with it. Carol backs
    // No, so the result has a real winner and nothing is refunded.
    await bet(carolClient, a, 1, 5)
    await resolve(a, 1)
    bobRow = (await netWorth()).get(bob.id)!
    expect(bobRow).toMatchObject({ balance: 60, at_stake: 0, score: 60 })
    expect((await getAtStake(bobClient)).dc).toBe(0)
  })

  it('ranks by net worth, not balance, with ties sharing a rank, and the standing agrees', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    // Bob has 40 DC in hand but 100 in net worth; Carol has 80 in hand, and that's all.
    await bet(bobClient, market, 0, 60)
    await setBalanceViaLedger(carol.id, 80)

    const board = await getLeaderboardPage(carolClient, 'all', NO_PAGE)
    // Tied members follow each other by id, which is random, so the tie's order isn't pinned.
    const byRankThenName = (a: (string | number)[], b: (string | number)[]) =>
      Number(a[2]) - Number(b[2]) || String(a[0]).localeCompare(String(b[0]))
    expect(board.rows.map((m) => [m.displayName, m.score, m.rank]).sort(byRankThenName)).toEqual([
      ['Alice', 100, 1],
      ['Bob', 100, 1],
      ['Carol', 80, 3],
    ])

    for (const [member, rank, score] of [
      [bob, 1, 100],
      [carol, 3, 80],
    ] as const) {
      expect(await getMemberStanding(aliceClient, member.id)).toMatchObject({ rank, score, memberCount: 3 })
    }
    expect(await getMemberStanding(aliceClient, bob.id)).toMatchObject({ balance: 40 })
  })
})

describe('season_profits', () => {
  it('counts every betting ledger type and none of the others', async () => {
    const at = '2026-06-10T15:00:00Z'
    const betting: [string, number][] = [
      ['bet_placed', -10],
      ['bet_won', 25],
      ['bet_refunded', 4],
      ['bet_voided_refund', 6],
      ['bet_cancelled', 3],
      ['resolution_reversed', -25],
      ['parlay_placed', -8],
      ['parlay_won', 40],
      ['parlay_refunded', 2],
      ['parlay_reversed', -40],
    ]
    const excluded: [string, number][] = [
      ['starting_grant', 100],
      ['task_completed', 12],
      ['admin_adjustment', 50],
      ['a_future_type', 7],
    ]
    let expected = 0
    for (const [type, amount] of betting) {
      await ledger(bob.id, amount, type, at)
      expected += amount
      expect(await profits('2026-06-01')).toEqual({ [bob.id]: expected })
    }
    for (const [type, amount] of excluded) {
      await ledger(bob.id, amount, type, at)
      expect(await profits('2026-06-01')).toEqual({ [bob.id]: expected })
    }
    // Only task income this month: not on the board at all.
    await ledger(carol.id, 12, 'task_completed', at)
    expect(Object.keys(await profits('2026-06-01'))).toEqual([bob.id])
  })

  it('splits months at midnight in New York, and counts a stake when it was placed, not when it paid', async () => {
    // 03:59Z on 1 August is 23:59 EDT on 31 July; 04:00Z is midnight.
    await ledger(bob.id, -20, 'bet_placed', '2026-08-01T03:59:00Z')
    await ledger(bob.id, 50, 'bet_won', '2026-08-01T04:00:00Z')
    expect(await profits('2026-07-01')).toEqual({ [bob.id]: -20 })
    expect(await profits('2026-08-01')).toEqual({ [bob.id]: 50 })
    // Any day of the month names that month.
    expect(await profits('2026-08-17')).toEqual({ [bob.id]: 50 })
  })
})

describe('leaderboard_month', () => {
  it("ranks this month's net betting profit, losses included, and leaves out members who haven't bet", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20 })
    await bet(bobClient, market, 0, 10)
    await bet(carolClient, market, 1, 30)
    await resolve(market, 0)

    // Bob is the only one on Yes, so he takes the real pool: floor(10 × 40 / 10) = 40.
    const board = await getLeaderboardPage(aliceClient, 'month', NO_PAGE)
    expect(board.rows.map((m) => [m.displayName, m.score, m.rank])).toEqual([
      ['Bob', 30, 1],
      ['Carol', -30, 2],
    ])
  })

  it('shares a rank on a tie', async () => {
    const now = new Date().toISOString()
    for (const member of [alice, bob]) await ledger(member.id, 15, 'bet_won', now)
    await ledger(carol.id, 5, 'bet_won', now)
    const board = await getLeaderboardPage(bobClient, 'month', NO_PAGE)
    expect(board.rows.map((m) => [m.displayName, m.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 1],
      ['Carol', 3],
    ])
  })

  it('shows an uninvited session nothing', async () => {
    await ledger(bob.id, 15, 'bet_won', new Date().toISOString())
    const dave = await makeMember('Dave')
    expect(await getLeaderboardPage(await clientFor(dave), 'month', NO_PAGE)).toEqual({ rows: [], next: null, windowed: false })
  })
})

describe('settle_season', () => {
  it("posts the month's top profit to the feed once, dated when the month ended", async () => {
    await ledger(alice.id, 30, 'bet_won', '2026-07-05T12:00:00Z')
    await ledger(bob.id, -10, 'bet_placed', '2026-07-06T12:00:00Z')
    await ledger(bob.id, 80, 'bet_won', '2026-07-20T12:00:00Z')
    // Task income never counts toward a season, however large.
    await ledger(carol.id, 500, 'task_completed', '2026-07-10T12:00:00Z')

    expect(await settle('2026-07-01')).toBe(bob.id)
    expect(await championEvents()).toEqual([
      { id: 'season:2026-07', kind: 'season_champion', occurred_at: '2026-08-01T04:00:00+00:00', actor_id: bob.id, amount: 70, hidden_at: null },
    ])

    // Settling again, even after the month's numbers are changed by hand, changes nothing.
    await ledger(alice.id, 200, 'bet_won', '2026-07-30T12:00:00Z')
    expect(await settle('2026-07-01')).toBe(bob.id)
    expect(await settle('2026-07-15')).toBe(bob.id)
    expect(await championEvents()).toHaveLength(1)

    // The feed and the champion's own activity both show it, named after the month.
    const feed = await listFeed(aliceClient, { page: NO_PAGE })
    expect(feed.rows[0]).toMatchObject({ id: 'season:2026-07', kind: 'season_champion', actorName: 'Bob', amount: 70, season: '2026-07' })
    const activity = await listFeed(aliceClient, { actorId: bob.id, page: NO_PAGE })
    expect(activity.rows.map((e) => e.kind)).toContain('season_champion')
  })

  it('gives a tie to whoever reached the total first', async () => {
    await ledger(bob.id, 40, 'bet_won', '2026-07-03T12:00:00Z')
    await ledger(alice.id, 50, 'bet_won', '2026-07-02T12:00:00Z')
    await ledger(alice.id, -10, 'bet_placed', '2026-07-09T12:00:00Z')
    // Both end on 40: Bob got there on the 3rd, Alice on the 9th.
    expect(await profits('2026-07-01')).toEqual({ [alice.id]: 40, [bob.id]: 40 })
    expect(await settle('2026-07-01')).toBe(bob.id)
  })

  it('posts nothing for a month with no betting, only task income, or nobody ahead', async () => {
    expect(await settle('2026-05-01')).toBeNull()

    await ledger(bob.id, 12, 'task_completed', '2026-04-10T12:00:00Z')
    expect(await settle('2026-04-01')).toBeNull()

    await ledger(bob.id, -10, 'bet_placed', '2026-03-10T12:00:00Z')
    await ledger(carol.id, -5, 'parlay_placed', '2026-03-11T12:00:00Z')
    expect(await settle('2026-03-01')).toBeNull()

    expect(await championEvents()).toEqual([])
  })

  it("refuses a month that hasn't ended, and settles last month when given none", async () => {
    const { error } = await serviceClient().rpc('settle_season', { p_month: new Date().toISOString().slice(0, 10) })
    expect(error?.message).toMatch(/has not ended/)

    const [{ month, mid }] = await pgQuery<{ month: string; mid: string }>(`
      select to_char(m, 'YYYY-MM') as month, ((m + interval '14 days')::timestamp at time zone 'America/New_York') as mid
      from (select date_trunc('month', (now() at time zone 'America/New_York') - interval '1 month') as m) last
    `)
    await ledger(carol.id, 9, 'parlay_won', mid)
    const { data, error: defaultErr } = await serviceClient().rpc('settle_season')
    expect(defaultErr).toBeNull()
    expect(data).toBe(carol.id)
    expect((await championEvents()).map((e) => e.id)).toEqual([`season:${month}`])
  })

  it("is closed to members, and a champion's event goes with their profile", async () => {
    for (const call of [bobClient.rpc('settle_season', { p_month: '2026-07-01' }), bobClient.rpc('season_profits', { p_month: '2026-07-01' })]) {
      expect((await call).error?.code).toBe('42501')
    }

    await ledger(carol.id, 9, 'bet_won', '2026-07-10T12:00:00Z')
    expect(await settle('2026-07-01')).toBe(carol.id)
    const { error } = await serviceClient().from('profiles').delete().eq('id', carol.id)
    expect(error).toBeNull()
    expect(await championEvents()).toEqual([])
  })
})
