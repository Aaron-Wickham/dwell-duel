import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, skipLedgerCheck } from './helpers'
import { seedMembers, makeMember, clientFor, anonClient, createTestMarket, createTestTask, ensureInvited, type Member, type TestMarket, giveRole } from './fixtures'
import { pgQuery } from './pg-query'

// The week of Monday 28 October 2030, when the clocks go back at 02:00 on Sunday 3 November. It
// starts at midnight EDT (UTC−4) and ends at midnight EST (UTC−5), so it's 169 hours long. It's in
// the future, so "closing next week" can be scripted without racing the real clock.
const WEEK = '2030-10-28'
const BEFORE_START = '2030-10-28T03:59:00Z' // Sunday 27 October 23:59 EDT, the week before
const START = '2030-10-28T04:00:00Z' // Monday 00:00 EDT
const MIDWEEK = '2030-10-30T12:00:00Z'
const LAST_MINUTE = '2030-11-04T04:59:00Z' // Sunday 3 November 23:59 EST
const END = '2030-11-04T05:00:00Z' // Monday 00:00 EST, the next week

type Recap = {
  week_start: string
  week_end: string
  my_betting_net: number
  my_betting_moves: number
  my_task_income: number
  best_bettor_id: string | null
  best_bettor_name: string | null
  best_market_id: string | null
  best_market_title: string | null
  best_stake: number | null
  best_payout: number | null
  upset_market_id: string | null
  upset_market_title: string | null
  upset_outcome_label: string | null
  upset_chance: number | null
  top_tasker_id: string | null
  top_tasker_name: string | null
  top_tasker_count: number | null
  closing_total: number
  closing: { id: string; title: string; close_at: string }[]
}

let alice: Member
let bob: Member
let carol: Member
let aliceClient: TestClient
let bobClient: TestClient
let carolClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  for (const client of [aliceClient, bobClient, carolClient]) await ensureInvited(client)
  // An admin, so she can resolve before close and override.
  await giveRole(alice, 'admin')
})

async function recap(client: TestClient = bobClient, week: string = WEEK): Promise<Recap> {
  const { data, error } = await client.rpc('weekly_recap', { p_week: week }).single<Recap>()
  if (error) throw error
  return data
}

// A ledger row written straight into coin_transactions, dated as given (as in net-worth-and-seasons).
async function ledger(profileId: string, amount: number, type: string, at: string): Promise<void> {
  await pgQuery(
    `insert into public.coin_transactions (profile_id, amount, type, created_at) values ('${profileId}', ${amount}, '${type}', '${at}')`,
  )
}

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

// Moves a market's result and its wins to `at` in the feed, which is where the recap reads them.
// Every one of them, including an override's hidden ones.
async function dateResult(market: TestMarket, at: string): Promise<void> {
  await pgQuery(`update public.activity_events set occurred_at = '${at}' where market_id = '${market.marketId}' and resolution_id is not null`)
}

describe('weekly_recap', () => {
  it('runs Monday 00:00 to Monday 00:00 in New York, across a DST change, from any day of the week', async () => {
    const row = await recap()
    expect([row.week_start, row.week_end]).toEqual(['2030-10-28T04:00:00+00:00', '2030-11-04T05:00:00+00:00'])
    expect((await recap(bobClient, '2030-11-03')).week_start).toBe(row.week_start)
    expect((await recap(bobClient, '2030-11-04')).week_start).toBe('2030-11-04T05:00:00+00:00')
  })

  it("is the caller's own net betting profit, with task rewards apart, and nothing else from the ledger", async () => {
    skipLedgerCheck('the test writes ledger rows or balances directly to shape history, so balances and the ledger differ')
    await ledger(bob.id, -10, 'bet_placed', BEFORE_START)
    await ledger(bob.id, 30, 'bet_won', START)
    await ledger(bob.id, -5, 'parlay_placed', LAST_MINUTE)
    await ledger(bob.id, 100, 'bet_won', END)
    await ledger(bob.id, 12, 'task_completed', LAST_MINUTE)
    await ledger(bob.id, 15, 'task_completed', END)
    await ledger(bob.id, 50, 'admin_adjustment', MIDWEEK)
    await ledger(bob.id, 100, 'starting_grant', MIDWEEK)
    await ledger(carol.id, 7, 'bet_won', MIDWEEK)

    expect(await recap(bobClient)).toMatchObject({ my_betting_net: 25, my_betting_moves: 2, my_task_income: 12 })
    expect(await recap(carolClient)).toMatchObject({ my_betting_net: 7, my_betting_moves: 1, my_task_income: 0 })
    expect(await recap(aliceClient)).toMatchObject({ my_betting_net: 0, my_betting_moves: 0, my_task_income: 0 })

    // Breaking even still counts as having bet.
    await ledger(alice.id, -10, 'bet_placed', MIDWEEK)
    await ledger(alice.id, 10, 'bet_cancelled', MIDWEEK)
    expect(await recap(aliceClient)).toMatchObject({ my_betting_net: 0, my_betting_moves: 2 })
  })

  it("names the week's best call and biggest upset, from results that still stand", async () => {
    // A: Bob's 10 of 30 effective on Yes, of 80: floor(10 × 80 / 30) = 26, a 16 DC profit, at 37.5%.
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20, title: 'Market A' })
    await bet(bobClient, a, 0, 10)
    await bet(carolClient, a, 1, 30)
    await resolve(a, 0)
    // B: Bob's 5 of 25 on Yes, of 70: floor(5 × 70 / 25) = 14, a 9 DC profit, at 25/70 ≈ 35.7%.
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: 20, title: 'Market B' })
    await bet(bobClient, b, 0, 5)
    await bet(carolClient, b, 1, 25)
    await resolve(b, 0)
    // E: nobody bet, so its winner's 1-in-3 seeded chance isn't an upset.
    const e = await createTestMarket(aliceClient, ['Red', 'Green', 'Blue'], { seed: 20, title: 'Market E' })
    await resolve(e, 0)
    // F, unseeded: Yes pays Bob 50 (a 40 DC profit, at 20%), until an override gives it to No,
    // Carol's 40 → 50 at 80%. Bob's win and the Yes result are hidden, so neither counts.
    const f = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market F' })
    await bet(bobClient, f, 0, 10)
    await bet(carolClient, f, 1, 40)
    await resolve(f, 0)
    await resolve(f, 1)
    // G: the same 40 DC win at 20%, but resolved as the next week began.
    const g = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market G' })
    await bet(bobClient, g, 0, 10)
    await bet(carolClient, g, 1, 40)
    await resolve(g, 0)

    await dateResult(a, START)
    await dateResult(b, LAST_MINUTE)
    await dateResult(e, MIDWEEK)
    await dateResult(f, MIDWEEK)
    await dateResult(g, END)

    let row = await recap(carolClient)
    expect(row).toMatchObject({
      best_bettor_id: bob.id,
      best_bettor_name: 'Bob',
      best_market_id: a.marketId,
      best_market_title: 'Market A',
      best_stake: 10,
      best_payout: 26,
      upset_market_id: b.marketId,
      upset_market_title: 'Market B',
      upset_outcome_label: 'Yes',
    })
    expect(row.upset_chance).toBeCloseTo(25 / 70, 10)

    // A resolved a minute before the week began: B's is now the only Bob win, and Carol's 10 DC
    // profit on F beats it. A's upset goes with it too.
    await dateResult(a, BEFORE_START)
    await dateResult(b, END)
    row = await recap(carolClient)
    expect(row).toMatchObject({ best_bettor_id: carol.id, best_market_id: f.marketId, best_stake: 40, best_payout: 50 })
    expect(row).toMatchObject({ upset_market_id: null, upset_chance: null })
  })

  it('names who had the most tasks approved, a tie going to whoever got there first', async () => {
    const { taskId } = await createTestTask(alice, { isRepeatable: true, period: 'daily' })
    let period = 0
    const completion = async (member: Member, status: 'approved' | 'rejected' | 'pending', reviewedAt: string | null) => {
      const { error } = await serviceClient()
        .from('task_completions')
        .insert({ task_id: taskId, profile_id: member.id, status, reward_amount: 10, period_key: `p${period++}`, reviewed_at: reviewedAt })
      if (error) throw error
    }

    // Carol reaches two on Wednesday, Alice at the week's last minute.
    await completion(carol, 'approved', START)
    await completion(carol, 'approved', MIDWEEK)
    await completion(alice, 'approved', MIDWEEK)
    await completion(alice, 'approved', LAST_MINUTE)
    // Bob's other approvals fall either side of the week, and the rest weren't approved.
    await completion(bob, 'approved', MIDWEEK)
    await completion(bob, 'approved', BEFORE_START)
    await completion(bob, 'approved', END)
    await completion(bob, 'rejected', MIDWEEK)
    await completion(bob, 'pending', null)

    expect(await recap()).toMatchObject({ top_tasker_id: carol.id, top_tasker_name: 'Carol', top_tasker_count: 2 })

    await completion(bob, 'approved', MIDWEEK)
    await completion(bob, 'approved', LAST_MINUTE)
    expect(await recap()).toMatchObject({ top_tasker_id: bob.id, top_tasker_name: 'Bob', top_tasker_count: 3 })
  })

  it('lists the open markets closing the week after, the first three and how many', async () => {
    const closes: [string, string, string?][] = [
      ['Next Monday 00:00', END],
      ['Next Sunday 23:59', '2030-11-11T04:59:00Z'],
      ['The Monday after', '2030-11-11T05:00:00Z'],
      ['This Sunday 23:59', LAST_MINUTE],
      ['Next Wednesday', '2030-11-06T12:00:00Z'],
      ['Voided Thursday', '2030-11-07T12:00:00Z', 'voided'],
      ['Next Friday', '2030-11-08T12:00:00Z'],
    ]
    const ids: Record<string, string> = {}
    for (const [title, closeAt, status] of closes) {
      const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
      ids[title] = market.marketId
      const { error } = await serviceClient()
        .from('markets')
        .update({ close_at: closeAt, ...(status ? { status } : {}) })
        .eq('id', market.marketId)
      if (error) throw error
    }

    const row = await recap()
    expect(row.closing_total).toBe(4)
    expect(row.closing.map((m) => [m.id, m.title, Date.parse(m.close_at)])).toEqual([
      [ids['Next Monday 00:00'], 'Next Monday 00:00', Date.parse(END)],
      [ids['Next Wednesday'], 'Next Wednesday', Date.parse('2030-11-06T12:00:00Z')],
      [ids['Next Friday'], 'Next Friday', Date.parse('2030-11-08T12:00:00Z')],
    ])
  })

  it('is empty for a quiet week', async () => {
    expect(await recap()).toMatchObject({
      my_betting_moves: 0,
      best_market_id: null,
      upset_market_id: null,
      top_tasker_id: null,
      closing_total: 0,
      closing: [],
    })
  })

  it('returns nothing to an uninvited session, and is closed to anon', async () => {
    const dave = await makeMember('Dave')
    const { data, error } = await (await clientFor(dave)).rpc('weekly_recap', { p_week: WEEK })
    expect(error).toBeNull()
    expect(data).toEqual([])

    expect((await anonClient().rpc('weekly_recap', { p_week: WEEK })).error?.code).toBe('42501')
  })
})
