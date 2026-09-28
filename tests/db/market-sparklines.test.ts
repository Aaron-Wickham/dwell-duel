import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'
import { buildProbabilitySeries, type SeriesPoint } from '@/lib/markets/probability-series'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

interface SparklinePoint {
  t: string
  shares: Record<string, number>
}

interface SparklineRow {
  market_id: string
  points: SparklinePoint[]
}

async function sparklines(client: SupabaseClient, marketIds: string[], points?: number): Promise<SparklineRow[]> {
  const { data, error } = await client.rpc('market_sparklines', {
    p_market_ids: marketIds,
    ...(points === undefined ? {} : { p_points: points }),
  })
  if (error) throw error
  return data as SparklineRow[]
}

// One market's points, after checking the call returned that market's row and nothing else.
async function pointsOf(client: SupabaseClient, market: TestMarket, points?: number): Promise<SparklinePoint[]> {
  const rows = await sparklines(client, [market.marketId], points)
  expect(rows.map((r) => r.market_id)).toEqual([market.marketId])
  return rows[0].points
}

async function placeBet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

// Inserted directly, a minute apart from 1 September: hundreds of place_bet calls would be slow,
// and the function never reads the outcomes' pools. Amounts and outcomes vary, so every share moves.
async function insertBets(market: TestMarket, count: number): Promise<void> {
  const start = Date.parse('2026-09-01T00:00:00.000Z')
  const rows = Array.from({ length: count }, (_, i) => ({
    market_id: market.marketId,
    outcome_id: market.outcomeIds[(i * 7) % market.outcomeIds.length],
    profile_id: i % 2 === 0 ? alice.id : bob.id,
    amount: 1 + ((i * 13) % 17),
    created_at: new Date(start + i * 60_000).toISOString(),
  }))
  const { error } = await serviceClient().from('bets').insert(rows)
  if (error) throw error
}

// The whole series the market page's chart draws, from every bet, oldest first.
async function fullSeries(market: TestMarket): Promise<SeriesPoint[]> {
  const { data, error } = await serviceClient()
    .from('bets')
    .select('outcome_id, amount, created_at')
    .eq('market_id', market.marketId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return buildProbabilitySeries(
    market.outcomeIds,
    data.map((b) => ({ outcomeId: b.outcome_id as string, amount: b.amount as number, createdAt: b.created_at as string })),
  )
}

// Which bets the function keeps: k evenly spaced positions from the first bet to the last.
function picked(series: SeriesPoint[], points: number): SeriesPoint[] {
  const k = Math.min(series.length, points)
  if (k === 1) return [series[series.length - 1]]
  return Array.from({ length: k }, (_, i) => series[Math.floor((i * (series.length - 1)) / (k - 1))])
}

// The database's float division is the same IEEE division as JavaScript's, but Supabase's Postgres
// sets extra_float_digits = 0, so each share reaches JSON rounded to 15 significant digits. Twelve
// decimal places is well inside that and far past anything a chart can show.
function expectSameSeries(points: SparklinePoint[], expected: SeriesPoint[]): void {
  expect(points).toHaveLength(expected.length)
  points.forEach((point, i) => {
    expect(Date.parse(point.t)).toBe(expected[i].t)
    expect(Object.keys(point.shares).sort()).toEqual(Object.keys(expected[i].shares).sort())
    for (const [outcomeId, share] of Object.entries(expected[i].shares)) {
      expect(point.shares[outcomeId]).toBeCloseTo(share, 12)
    }
  })
}

describe('market_sparklines', () => {
  it("returns every bet's shares when a market has fewer bets than p_points, as buildProbabilitySeries computes them", async () => {
    const market = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'])
    await placeBet(aliceClient, market, 0, 10)
    await placeBet(bobClient, market, 1, 3)
    await placeBet(bobClient, market, 0, 7)
    await placeBet(aliceClient, market, 1, 4)

    const points = await pointsOf(bobClient, market)
    const series = await fullSeries(market)
    expect(series).toHaveLength(4)
    expectSameSeries(points, series)
    // Green has no bets, and still has a share: zero, as the chart draws it.
    expect(points.every((p) => p.shares[market.outcomeIds[2]] === 0)).toBe(true)
    expect(points.at(-1)!.shares[market.outcomeIds[0]]).toBeCloseTo(17 / 24, 12)
  })

  it('breaks same-instant ties by id, the same order fullSeries reads and buildProbabilitySeries keeps', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const tie = new Date('2026-09-01T00:00:00.000Z').toISOString()
    const { error } = await serviceClient()
      .from('bets')
      .insert([
        { market_id: market.marketId, outcome_id: market.outcomeIds[1], profile_id: bob.id, amount: 9, created_at: tie },
        { market_id: market.marketId, outcome_id: market.outcomeIds[0], profile_id: alice.id, amount: 3, created_at: tie },
        { market_id: market.marketId, outcome_id: market.outcomeIds[0], profile_id: alice.id, amount: 5, created_at: tie },
      ])
    if (error) throw error

    const points = await pointsOf(bobClient, market)
    const series = await fullSeries(market)
    expect(series).toHaveLength(3)
    expectSameSeries(points, series)
  })

  it('picks at most p_points evenly spaced bets, always the first and the last', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await insertBets(market, 25)

    const points = await pointsOf(bobClient, market, 7)
    const series = await fullSeries(market)
    expectSameSeries(points, picked(series, 7))
    expect(Date.parse(points[0].t)).toBe(series[0].t)
    expect(Date.parse(points.at(-1)!.t)).toBe(series.at(-1)!.t)

    // The default is 40 points, more than this market's 25 bets, so every bet comes back.
    expectSameSeries(await pointsOf(bobClient, market), series)
  })

  it('returns every bet when a market has exactly p_points bets', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await insertBets(market, 40)
    const series = await fullSeries(market)
    expect(series).toHaveLength(40)
    expectSameSeries(await pointsOf(bobClient, market), series)
  })

  it('treats a null p_points as the default of 40', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await insertBets(market, 45)
    const series = await fullSeries(market)

    const { data, error } = await bobClient.rpc('market_sparklines', { p_market_ids: [market.marketId], p_points: null })
    if (error) throw error
    const rows = data as SparklineRow[]
    expect(rows.map((r) => r.market_id)).toEqual([market.marketId])
    expectSameSeries(rows[0].points, picked(series, 40))
  })

  it('caps p_points at 200, and keeps the last bet when asked for fewer than one', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No', 'Maybe'])
    await insertBets(market, 205)
    const series = await fullSeries(market)

    const capped = await pointsOf(bobClient, market, 1000)
    expect(capped).toHaveLength(200)
    expectSameSeries(capped, picked(series, 200))

    for (const points of [1, 0, -5]) {
      expectSameSeries(await pointsOf(bobClient, market, points), [series.at(-1)!])
    }
  })

  it('keeps its running sums to the bets plus one marker per picked bet and outcome, never bets × outcomes', async () => {
    const market = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'])
    await insertBets(market, 100)

    interface PlanNode {
      'Node Type': string
      'Actual Rows': number
      Plans?: PlanNode[]
    }
    // Each WindowAgg's row count is set by the data, not by the planner's choices: 0035's running
    // pools windowed over every bet joined to every outcome, 100 × 3 = 300 rows here. Now the
    // widest window is the bets themselves plus a marker for each of the 5 picked bets in each of
    // the 3 outcomes' runs.
    const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
      `explain (analyze, format json) select * from public.market_sparklines(array['${market.marketId}']::uuid[], 5)`,
    )
    const windows: number[] = []
    const walk = (node: PlanNode) => {
      if (node['Node Type'] === 'WindowAgg') windows.push(node['Actual Rows'])
      node.Plans?.forEach(walk)
    }
    walk(row['QUERY PLAN'][0].Plan)

    expect(windows.length).toBeGreaterThan(0)
    expect(Math.max(...windows)).toBeLessThanOrEqual(100 + 5 * 3)
    expectSameSeries(await pointsOf(bobClient, market, 5), picked(await fullSeries(market), 5))
  })

  it('returns one row for each market that has bets, with its points in bet order', async () => {
    const empty = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'No bets' })
    const first = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'First' })
    const second = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Second' })
    await placeBet(aliceClient, first, 0, 5)
    await placeBet(bobClient, second, 1, 8)
    await placeBet(aliceClient, first, 1, 15)

    const rows = await sparklines(bobClient, [empty.marketId, first.marketId, second.marketId])
    expect(rows.map((r) => r.market_id).sort()).toEqual([first.marketId, second.marketId].sort())
    expectSameSeries(rows.find((r) => r.market_id === first.marketId)!.points, await fullSeries(first))
    expectSameSeries(rows.find((r) => r.market_id === second.marketId)!.points, await fullSeries(second))
    expect(await sparklines(bobClient, [empty.marketId])).toEqual([])
  })

  it('returns one row even when the same market id is sent twice', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)

    const rows = await sparklines(bobClient, [market.marketId, market.marketId])
    expect(rows).toHaveLength(1)
    expect(rows[0].market_id).toBe(market.marketId)
  })

  it('reads at most 50 market ids per call, and returns every point of all 50 in one response', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)
    // Fifty more markets with 41 bets each, inserted directly: fifty create_market calls and 2,050
    // place_bet calls are slow. 50 × 40 points is 2,000, twice PostgREST's 1,000-row cap (max_rows,
    // supabase/config.toml), which one row per market keeps out of reach.
    const db = serviceClient()
    const { data: others, error } = await db
      .from('markets')
      .insert(
        Array.from({ length: 50 }, (_, i) => ({
          created_by: alice.id,
          title: `Filler ${i}`,
          kind: 'binary',
          close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })),
      )
      .select('id')
    if (error) throw error
    const fillers = others.map((m) => m.id as string)
    const { data: outcomes, error: outcomesErr } = await db
      .from('market_outcomes')
      .insert(fillers.flatMap((id) => [{ market_id: id, label: 'Yes' }, { market_id: id, label: 'No' }]))
      .select('id, market_id')
    if (outcomesErr) throw outcomesErr
    const outcomesOf = new Map<string, string[]>()
    for (const o of outcomes) outcomesOf.set(o.market_id as string, [...(outcomesOf.get(o.market_id as string) ?? []), o.id as string])
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    const { error: betsErr } = await db.from('bets').insert(
      fillers.flatMap((id) =>
        Array.from({ length: 41 }, (_, i) => ({
          market_id: id,
          outcome_id: outcomesOf.get(id)![i % 2],
          profile_id: alice.id,
          amount: 1 + (i % 5),
          created_at: new Date(start + i * 60_000).toISOString(),
        })),
      ),
    )
    if (betsErr) throw betsErr

    const past = await sparklines(bobClient, [...fillers, market.marketId])
    expect(past.map((r) => r.market_id).sort()).toEqual([...fillers].sort())
    expect(past.every((r) => r.points.length === 40)).toBe(true)

    const within = await sparklines(bobClient, [market.marketId, ...fillers])
    expect(within).toHaveLength(50)
    expect(within.find((r) => r.market_id === market.marketId)?.points).toHaveLength(1)
  })

  it('caps by flattened element count, so a nested array cannot smuggle more than 50 ids past the cap', async () => {
    // p_market_ids[1:50] slices only the array's first dimension: a single "row" holding every id
    // would pass that slice whole, and unnest() flattens all dimensions anyway, so the cap would
    // never bite. 59 real markets, each with a bet, sent as one nested array: only the first 50
    // flattened elements may come back.
    const db = serviceClient()
    const { data: markets, error } = await db
      .from('markets')
      .insert(
        Array.from({ length: 59 }, (_, i) => ({
          created_by: alice.id,
          title: `Nested ${i}`,
          kind: 'binary',
          close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })),
      )
      .select('id')
    if (error) throw error
    const marketIds = markets.map((m) => m.id as string)
    const { data: outcomes, error: outcomesErr } = await db
      .from('market_outcomes')
      .insert(marketIds.flatMap((id) => [{ market_id: id, label: 'Yes' }, { market_id: id, label: 'No' }]))
      .select('id, market_id')
    if (outcomesErr) throw outcomesErr
    const outcomesOf = new Map<string, string[]>()
    for (const o of outcomes) outcomesOf.set(o.market_id as string, [...(outcomesOf.get(o.market_id as string) ?? []), o.id as string])
    const { error: betsErr } = await db.from('bets').insert(
      marketIds.map((id) => ({
        market_id: id,
        outcome_id: outcomesOf.get(id)![0],
        profile_id: alice.id,
        amount: 5,
        created_at: new Date().toISOString(),
      })),
    )
    if (betsErr) throw betsErr

    const { data, error: rpcErr } = await bobClient.rpc('market_sparklines', { p_market_ids: [marketIds] })
    if (rpcErr) throw rpcErr
    const rows = data as SparklineRow[]
    expect(rows).toHaveLength(50)
    expect(rows.map((r) => r.market_id).sort()).toEqual(marketIds.slice(0, 50).sort())
    for (const id of marketIds.slice(50)) expect(rows.some((r) => r.market_id === id)).toBe(false)
  })

  it('returns nothing to an uninvited member, and is closed to anon', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await sparklines(carolClient, [market.marketId])).toEqual([])

    const [fn] = await pgQuery<{
      anon: boolean
      authenticated: boolean
      service_role: boolean
      security_definer: boolean
      volatility: string
    }>(`
      select
        has_function_privilege('anon', 'public.market_sparklines(uuid[], integer)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.market_sparklines(uuid[], integer)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.market_sparklines(uuid[], integer)', 'execute') as service_role,
        p.prosecdef as security_definer,
        p.provolatile::text as volatility
      from pg_proc p
      where p.oid = 'public.market_sparklines(uuid[], integer)'::regprocedure
    `)
    expect(fn).toEqual({ anon: false, authenticated: true, service_role: true, security_definer: false, volatility: 's' })
  })

  it("reads each market's bets through bets_market_created_idx", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)
    await placeBet(bobClient, market, 1, 5)
    await pgQuery('vacuum (analyze) public.bets, public.market_outcomes;')

    interface PlanNode {
      'Node Type': string
      'Relation Name'?: string
      'Index Name'?: string
      'Index Cond'?: string
      'Recheck Cond'?: string
      Plans?: PlanNode[]
    }
    // The function is plain SQL with no SET clause, so Postgres inlines it and EXPLAIN shows the
    // bet reads inside it; a scan of bets in the plan proves the inlining. The fixture is two bets,
    // where a sequential scan is cheapest whatever the indexes, so seq scans are priced out for the
    // one statement. Each market's bets come from an `offset 0`-fenced lateral subquery keyed on the
    // market id, which Postgres can't flatten into a plain join, so the lookup is planned per market
    // and keyed on market_id — either a plain Index Scan (an Index Cond of its own) or a Bitmap Heap
    // Scan (a Recheck Cond, with the Index Cond one level down on its Bitmap Index Scan child) —
    // rather than one scan of every matched bet filtered by a Join Filter.
    const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
      `set local enable_seqscan = off; explain (format json) select * from public.market_sparklines(array['${market.marketId}']::uuid[], 40)`,
    )
    const nodes: PlanNode[] = []
    const walk = (node: PlanNode) => {
      nodes.push(node)
      node.Plans?.forEach(walk)
    }
    walk(row['QUERY PLAN'][0].Plan)

    const betScans = nodes.filter((n) => n['Relation Name'] === 'bets')
    expect(betScans.length).toBeGreaterThan(0)
    for (const scan of betScans) {
      expect(scan['Node Type']).not.toBe('Seq Scan')
      const cond = scan['Index Cond'] ?? scan['Recheck Cond'] ?? scan.Plans?.find((p) => p['Index Cond'])?.['Index Cond']
      expect(cond).toMatch(/market_id/)
    }
    const indexNames = nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : []))
    expect(indexNames).toContain('bets_market_created_idx')
  })
})
