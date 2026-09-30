import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serviceClient, type TestClient } from './helpers'
import {
  seedMembers,
  makeMember,
  clientFor,
  createTestMarket,
  createTestTask,
  ensureInvited,
  type Member,
  type TestMarket, giveRole } from './fixtures'
import { pgQuery } from './pg-query'

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
  // Alice is an admin so she can resolve before close_at, override, void and review tasks.
  await giveRole(alice, 'admin')
})

async function bet(client: TestClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<string> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_note: 'Resolved in a test',
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('markets')
    .select('current_resolution_id')
    .eq('id', market.marketId)
    .single()
  if (readErr) throw readErr
  return data.current_resolution_id as string
}

async function placeParlay(client: TestClient, outcomeIds: string[], stake: number): Promise<string> {
  const { data, error } = await client.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
  return data as string
}

async function betIds(marketId: string): Promise<Record<string, number>> {
  const { data, error } = await serviceClient().from('bets').select('id, profile_id').eq('market_id', marketId)
  if (error) throw error
  return Object.fromEntries(data.map((b) => [b.profile_id as string, b.id as number]))
}

interface Mismatch {
  side: string
  id: string
  kind: string
}

// Every visible event, with the names and labels a reader joins onto it, against every row of
// activity_feed: id, kind, occurred_at, actor_id and amount as the spec names them, plus the
// market, outcome label, leg count and task title, which prove the stored related ids are right.
// Both directions, so a missing row and an extra one both show up. Empty means equal.
//
// season_champion (0051) is left out: settle_season writes it on demand, from a finished month's
// ledger, not a trigger from a source row, so the view has nothing to derive it from. The
// scenario still settles a season, so the comparison proves the champion's row changes nothing
// else, and tests/db/net-worth-and-seasons.test.ts covers the row itself. market_voided (0073)
// is left out the same way: void_market writes it, and the view predates it; tests/db/
// void-market.test.ts covers that row.
const MISMATCHES = `
  with stored as (
    select e.id, e.kind, e.occurred_at, e.actor_id, e.amount, e.market_id, o.label as outcome_label,
      case when e.kind in ('parlay_placed', 'parlay_won') then (select count(*)::integer from public.parlay_legs l where l.parlay_id = e.parlay_id) end as leg_count,
      t.title as task_title
    from public.activity_events e
    left join public.market_outcomes o on o.id = e.outcome_id
    left join public.task_completions c on c.id = e.task_completion_id
    left join public.tasks t on t.id = c.task_id
    where e.hidden_at is null and e.kind not in ('season_champion', 'market_voided')
  ),
  derived as (
    select id, kind, occurred_at, actor_id, amount, market_id, outcome_label, leg_count, task_title
    from public.activity_feed
  )
  select 'view only' as side, id, kind from (select * from derived except select * from stored) missing
  union all
  select 'table only' as side, id, kind from (select * from stored except select * from derived) extra
  order by id, side
`

async function mismatches(): Promise<Mismatch[]> {
  return pgQuery<Mismatch>(MISMATCHES)
}

async function feedCount(): Promise<number> {
  const [row] = await pgQuery<{ n: number }>('select count(*)::integer as n from public.activity_feed')
  return row.n
}

interface StoredEvent {
  id: string
  kind: string
  occurred_at: string
  amount: number | null
  resolution_id: string | null
  hidden_at: string | null
}

async function eventsFor(column: 'market_id' | 'parlay_id', value: string): Promise<StoredEvent[]> {
  const { data, error } = await serviceClient()
    .from('activity_events')
    .select('id, kind, occurred_at, amount, resolution_id, hidden_at')
    .eq(column, value)
    .order('id')
  if (error) throw error
  return data as StoredEvent[]
}

const visibleIds = (events: StoredEvent[]) => events.filter((e) => e.hidden_at === null).map((e) => e.id).sort()
const hiddenIds = (events: StoredEvent[]) => events.filter((e) => e.hidden_at !== null).map((e) => e.id).sort()

// The spec's scenario, checking the table against the view after every step.
async function fullScenario(): Promise<void> {
  const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Scenario A', seed: 20 })
  const b = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'], { title: 'Scenario B', seed: 20 })
  expect(await mismatches()).toEqual([])

  // Seeded like every real market, so no outcome is ever empty (a parlay leg's odds leave out the
  // bettor's own stake, 0046). Bob's stake makes A's payout floor a fraction: effective pool
  // 46 + 40 = 86, winning pool 16 + 20 = 36, floor(11 × 86 / 36) = floor(26.27) = 26.
  await bet(bobClient, a, 0, 11)
  await bet(carolClient, a, 1, 30)
  await bet(aliceClient, a, 0, 5)
  await bet(bobClient, b, 0, 4)
  await bet(carolClient, b, 1, 6)
  await bet(aliceClient, b, 2, 2)
  expect(await mismatches()).toEqual([])

  // A cancelled bet leaves both the view and the table.
  await bet(carolClient, a, 0, 7)
  const { data: carolBet, error: readErr } = await serviceClient()
    .from('bets')
    .select('id')
    .eq('market_id', a.marketId)
    .eq('profile_id', carol.id)
    .eq('amount', 7)
    .single()
  if (readErr) throw readErr
  const { error: cancelErr } = await carolClient.rpc('cancel_bet', { p_bet_id: carolBet.id })
  if (cancelErr) throw cancelErr
  expect(await mismatches()).toEqual([])

  await placeParlay(bobClient, [a.outcomeIds[0], b.outcomeIds[0]], 10)
  await placeParlay(carolClient, [a.outcomeIds[1], b.outcomeIds[1]], 5)
  expect(await mismatches()).toEqual([])

  await resolve(a, 0)
  expect(await mismatches()).toEqual([])

  // Voiding B settles both parlays on A alone: Bob's wins, Carol's loses.
  const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId, p_reason: 'Voided in a test' })
  if (voidErr) throw voidErr
  expect(await mismatches()).toEqual([])

  // The override claws back A's payouts and reverses Bob's parlay; Carol's parlay now wins.
  await resolve(a, 1)
  expect(await mismatches()).toEqual([])

  const { taskId } = await createTestTask(alice, { title: 'Read Psalm 1', rewardAmount: 12 })
  const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
  if (submitErr) throw submitErr
  const { error: approveErr } = await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })
  if (approveErr) throw approveErr
  expect(await mismatches()).toEqual([])

  // A second completion, approved through the batch path instead of the single one.
  const { taskId: taskId2 } = await createTestTask(alice, { title: 'Read Psalm 2', rewardAmount: 8 })
  const { data: completionId2, error: submitErr2 } = await carolClient.rpc('submit_task_completion', { p_task_id: taskId2 })
  if (submitErr2) throw submitErr2
  const { data: reviewRows, error: reviewErr } = await aliceClient.rpc('review_task_completions', {
    p_ids: [completionId2],
    p_approve: true,
  })
  if (reviewErr) throw reviewErr
  expect(reviewRows).toEqual([{ id: completionId2, ok: true, error: null }])
  expect(await mismatches()).toEqual([])

  // A finished month's champion, from ledger rows dated in June (the balance follows it).
  await pgQuery(`insert into public.coin_transactions (profile_id, amount, type, created_at) values ('${carol.id}', 18, 'bet_won', '2026-06-12T12:00:00Z'); update public.profiles set balance = balance + 18 where id = '${carol.id}'`)
  const { data: champion, error: settleErr } = await serviceClient().rpc('settle_season', { p_month: '2026-06-01' })
  if (settleErr) throw settleErr
  expect(champion).toBe(carol.id)
  expect(await mismatches()).toEqual([])
}

describe('activity_events', () => {
  it('holds exactly the rows activity_feed shows after every step of a full scenario', async () => {
    await fullScenario()

    const kinds = await pgQuery<{ kind: string; visible: number; hidden: number }>(`
      select kind, count(*) filter (where hidden_at is null)::integer as visible, count(*) filter (where hidden_at is not null)::integer as hidden
      from public.activity_events group by kind order by kind
    `)
    // Every kind is covered, and the override really did hide rows, so the comparison isn't vacuous.
    expect(kinds).toEqual([
      { kind: 'bet_placed', visible: 6, hidden: 0 },
      { kind: 'bet_won', visible: 1, hidden: 2 },
      { kind: 'market_created', visible: 2, hidden: 0 },
      { kind: 'market_resolved', visible: 1, hidden: 1 },
      { kind: 'market_voided', visible: 1, hidden: 0 },
      { kind: 'parlay_placed', visible: 2, hidden: 0 },
      { kind: 'parlay_won', visible: 1, hidden: 1 },
      { kind: 'season_champion', visible: 1, hidden: 0 },
      { kind: 'task_completed', visible: 2, hidden: 0 },
    ])
    expect(await feedCount()).toBe(15)
  })

  it("backfills, from activity_feed, the same rows the triggers wrote", async () => {
    await fullScenario()

    // The migration's own backfill statement, run into a scratch copy of the table, so the real
    // rows stay as the triggers left them. Every column is compared, related ids included. The
    // champion and the void aren't rows the view ever had, so they aren't ones the backfill makes.
    const migration = readFileSync(path.resolve('supabase/migrations/0035_activity_events.sql'), 'utf8')
    const backfill = migration.match(/^insert into public\.activity_events [^;]*?from public\.activity_feed[^;]*;/m)?.[0]
    expect(backfill).toBeDefined()
    const columns = 'id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, parlay_id, task_completion_id, amount'
    const [result] = await pgQuery<{ differing: number; backfilled: number }>(`
      create temp table backfill (like public.activity_events) on commit drop;
      ${backfill!.replace('insert into public.activity_events', 'insert into pg_temp.backfill')}
      select
        (select count(*)::integer from (
          (select ${columns} from pg_temp.backfill except select ${columns} from public.activity_events where hidden_at is null and kind not in ('season_champion', 'market_voided'))
          union all
          (select ${columns} from public.activity_events where hidden_at is null and kind not in ('season_champion', 'market_voided') except select ${columns} from pg_temp.backfill)
        ) d) as differing,
        (select count(*)::integer from pg_temp.backfill) as backfilled
    `)
    expect(result).toEqual({ differing: 0, backfilled: 15 })
  })

  it("hides exactly the old resolution's rows on an override, and shows a new resolution's rows when it goes back", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Override market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 15)
    const bets = await betIds(market.marketId)

    const first = await resolve(market, 0)
    const second = await resolve(market, 1)
    let events = await eventsFor('market_id', market.marketId)
    expect(hiddenIds(events)).toEqual([`resolution:${first}`, `win:${bets[bob.id]}:${first}`].sort())
    expect(visibleIds(events)).toEqual(
      [
        `market:${market.marketId}`,
        `bet:${bets[bob.id]}`,
        `bet:${bets[alice.id]}`,
        `resolution:${second}`,
        `win:${bets[alice.id]}:${second}`,
      ].sort(),
    )
    expect(await mismatches()).toEqual([])

    // Back to the first outcome: a new resolution id, so new rows, and the first stay hidden.
    const third = await resolve(market, 0)
    events = await eventsFor('market_id', market.marketId)
    expect(hiddenIds(events)).toEqual(
      [
        `resolution:${first}`,
        `win:${bets[bob.id]}:${first}`,
        `resolution:${second}`,
        `win:${bets[alice.id]}:${second}`,
      ].sort(),
    )
    expect(visibleIds(events)).toEqual(
      [
        `market:${market.marketId}`,
        `bet:${bets[bob.id]}`,
        `bet:${bets[alice.id]}`,
        `resolution:${third}`,
        `win:${bets[bob.id]}:${third}`,
      ].sort(),
    )
    // Pool 20, winning pool 5: Bob is paid floor(5 × 20 / 5) = 20, the same as the ledger.
    expect(events.find((e) => e.id === `win:${bets[bob.id]}:${third}`)?.amount).toBe(20)
    expect(await mismatches()).toEqual([])
  })

  it("hides a parlay's win when an override reverses it, and shows it again, re-dated, when it wins again", async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Leg A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Leg B' })
    for (const m of [a, b]) {
      await bet(aliceClient, m, 0, 5)
      await bet(aliceClient, m, 1, 15)
    }
    const parlayId = await placeParlay(bobClient, [a.outcomeIds[0], b.outcomeIds[0]], 10)
    await resolve(a, 0)
    await resolve(b, 0)

    const db = serviceClient()
    const settled = async () => {
      const { data, error } = await db.from('parlays').select('status, credited, settled_at').eq('id', parlayId).single()
      if (error) throw error
      return data
    }
    const won = await settled()
    expect(won.status).toBe('won')
    let win = (await eventsFor('parlay_id', parlayId)).find((e) => e.kind === 'parlay_won')!
    expect(win).toMatchObject({ id: `parlay_win:${parlayId}`, amount: won.credited, hidden_at: null })
    expect(Date.parse(win.occurred_at)).toBe(Date.parse(won.settled_at!))

    await resolve(a, 1)
    expect((await settled()).status).toBe('lost')
    win = (await eventsFor('parlay_id', parlayId)).find((e) => e.kind === 'parlay_won')!
    expect(win.hidden_at).not.toBeNull()
    expect(await mismatches()).toEqual([])

    await resolve(a, 0)
    const wonAgain = await settled()
    expect(wonAgain.status).toBe('won')
    const events = await eventsFor('parlay_id', parlayId)
    expect(events.filter((e) => e.kind === 'parlay_won')).toHaveLength(1)
    win = events.find((e) => e.kind === 'parlay_won')!
    expect(win).toMatchObject({ amount: wonAgain.credited, hidden_at: null })
    expect(Date.parse(win.occurred_at)).toBe(Date.parse(wonAgain.settled_at!))
    expect(Date.parse(wonAgain.settled_at!)).toBeGreaterThan(Date.parse(won.settled_at!))
    expect(await mismatches()).toEqual([])
  })

  it('stays equal to the view when a source row is written directly, as the scale seed does', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Direct A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Direct B' })
    await bet(aliceClient, a, 0, 5)
    await bet(aliceClient, b, 0, 5)
    const parlayId = await placeParlay(bobClient, [a.outcomeIds[0], b.outcomeIds[0]], 10)
    const { taskId } = await createTestTask(alice, { title: 'Seeded task', rewardAmount: 9 })

    const db = serviceClient()
    const { error: parlayErr } = await db.from('parlays').update({ created_at: '2026-08-01T10:00:00+00:00' }).eq('id', parlayId)
    if (parlayErr) throw parlayErr
    const { error: completionErr } = await db.from('task_completions').insert({
      task_id: taskId,
      profile_id: bob.id,
      status: 'approved',
      reward_amount: 9,
      period_key: 'once',
      submitted_at: '2026-08-02T10:00:00+00:00',
      reviewed_at: '2026-08-03T10:00:00+00:00',
      reviewed_by: alice.id,
    })
    if (completionErr) throw completionErr

    expect(await mismatches()).toEqual([])
    const { data, error } = await db.from('activity_events').select('kind').in('kind', ['parlay_placed', 'task_completed'])
    if (error) throw error
    expect(data.map((e) => e.kind).sort()).toEqual(['parlay_placed', 'task_completed'])
  })

  it('shows an uninvited member nothing, and lets no member write', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Private market' })
    await bet(bobClient, market, 0, 5)

    const { data: visible, error: readErr } = await bobClient.from('activity_events').select('id')
    expect(readErr).toBeNull()
    expect(visible).toHaveLength(2)

    const dave = await makeMember('Dave')
    const daveClient = await clientFor(dave)
    const { data: hidden, error: uninvitedErr } = await daveClient.from('activity_events').select('id')
    expect(uninvitedErr).toBeNull()
    expect(hidden).toEqual([])

    const insert = await bobClient.from('activity_events').insert({
      id: 'bet:999999',
      kind: 'bet_placed',
      occurred_at: new Date().toISOString(),
      actor_id: bob.id,
    })
    expect(insert.error?.code).toBe('42501')
    const update = await bobClient.from('activity_events').update({ hidden_at: new Date().toISOString() }).eq('actor_id', bob.id)
    expect(update.error?.code).toBe('42501')
    const remove = await bobClient.from('activity_events').delete().eq('actor_id', bob.id)
    expect(remove.error?.code).toBe('42501')

    const { data: after, error: afterErr } = await serviceClient().from('activity_events').select('id, hidden_at')
    if (afterErr) throw afterErr
    expect(after).toHaveLength(2)
    expect(after.every((e) => e.hidden_at === null)).toBe(true)
  })
})

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Index Cond'?: string
  Plans?: PlanNode[]
}

// The fixtures are a handful of rows, where Postgres would scan or sort whatever the indexes, so
// both are priced out for the one statement: a plan that still reads activity_events in feed order
// can only be walking an index that holds that order. `set local` ends with postgres-meta's
// implicit transaction.
// `analyze` first: every test file's setup wipes the tables in one statement (#214), and until
// autovacuum catches up the planner's row estimates are left over from earlier files, so it could
// pick a different index depending on file order (#233). Fresh stats make the plan deterministic.
async function planNodes(query: string): Promise<PlanNode[]> {
  const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
    `analyze; set local enable_seqscan = off; set local enable_bitmapscan = off; set local enable_sort = off; explain (format json) ${query}`,
  )
  const nodes: PlanNode[] = []
  const walk = (node: PlanNode) => {
    nodes.push(node)
    node.Plans?.forEach(walk)
  }
  walk(row['QUERY PLAN'][0].Plan)
  return nodes
}

const COLUMNS = 'id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, parlay_id, task_completion_id, amount'

describe('activity_events indexes', () => {
  let newest: { occurred_at: string; id: string }

  beforeEach(async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 10)
    await bet(aliceClient, market, 1, 5)
    await resolve(market, 0)
    const { data, error } = await serviceClient()
      .from('activity_events')
      .select('occurred_at, id')
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .single()
    if (error) throw error
    newest = data
    // full, so the previous file's wiped rows can't leave a bloated heap that tips the planner to the feed index
    await pgQuery('vacuum (full, analyze) public.activity_events;')
  })

  it('reads a feed page, and a range below a cursor, in order from activity_events_feed_idx', async () => {
    const ts = newest.occurred_at
    for (const where of [
      'hidden_at is null',
      // listFeed's range read (lib/pagination/keyset.ts): a plain bound beside the tiebreak OR.
      `hidden_at is null and occurred_at <= '${ts}' and (occurred_at < '${ts}' or (occurred_at = '${ts}' and id <= '${newest.id}'))`,
    ]) {
      const nodes = await planNodes(`select ${COLUMNS} from public.activity_events where ${where} order by occurred_at desc, id desc limit 51`)
      const scans = nodes.filter((n) => n['Relation Name'] === 'activity_events')
      expect(scans.map((n) => n['Index Name'])).toEqual(['activity_events_feed_idx'])
      expect(nodes.some((n) => n['Node Type'] === 'Sort')).toBe(false)
    }
  })

  it("reads one member's page from activity_events_actor_idx, narrowed by the actor", async () => {
    const ts = newest.occurred_at
    for (const where of [
      `hidden_at is null and actor_id = '${bob.id}'`,
      `hidden_at is null and actor_id = '${bob.id}' and occurred_at <= '${ts}' and (occurred_at < '${ts}' or (occurred_at = '${ts}' and id <= '${newest.id}'))`,
    ]) {
      const nodes = await planNodes(`select ${COLUMNS} from public.activity_events where ${where} order by occurred_at desc, id desc limit 51`)
      const scans = nodes.filter((n) => n['Relation Name'] === 'activity_events')
      expect(scans.map((n) => n['Index Name'])).toEqual(['activity_events_actor_idx'])
      expect(scans[0]['Index Cond']).toContain(bob.id)
      expect(nodes.some((n) => n['Node Type'] === 'Sort')).toBe(false)
    }
  })
})
