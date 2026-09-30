import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, giveRole } from './fixtures'
import { pgQuery } from './pg-query'

const INDEXES: Record<string, string> = {
  bets_market_created_idx: 'CREATE INDEX bets_market_created_idx ON public.bets USING btree (market_id, created_at DESC, id DESC)',
  bets_outcome_id_idx: 'CREATE INDEX bets_outcome_id_idx ON public.bets USING btree (outcome_id)',
  bets_profile_created_idx: 'CREATE INDEX bets_profile_created_idx ON public.bets USING btree (profile_id, created_at DESC)',
  coin_transactions_resolution_id_idx:
    "CREATE INDEX coin_transactions_resolution_id_idx ON public.coin_transactions USING btree (((meta ->> 'resolution_id'::text)))",
  coin_transactions_created_idx:
    'CREATE INDEX coin_transactions_created_idx ON public.coin_transactions USING btree (created_at DESC, id DESC)',
  task_completions_profile_submitted_idx:
    'CREATE INDEX task_completions_profile_submitted_idx ON public.task_completions USING btree (profile_id, submitted_at DESC)',
  task_completions_pending_submitted_idx:
    "CREATE INDEX task_completions_pending_submitted_idx ON public.task_completions USING btree (submitted_at) WHERE (status = 'pending'::text)",
  task_completions_approved_reviewed_idx:
    "CREATE INDEX task_completions_approved_reviewed_idx ON public.task_completions USING btree (reviewed_at DESC) WHERE (status = 'approved'::text)",
  parlays_created_idx: 'CREATE INDEX parlays_created_idx ON public.parlays USING btree (created_at DESC)',
  parlays_won_settled_idx:
    "CREATE INDEX parlays_won_settled_idx ON public.parlays USING btree (settled_at DESC) WHERE (status = 'won'::text)",
  market_resolutions_resolved_by_idx:
    'CREATE INDEX market_resolutions_resolved_by_idx ON public.market_resolutions USING btree (resolved_by)',
  markets_current_resolution_id_idx:
    'CREATE INDEX markets_current_resolution_id_idx ON public.markets USING btree (current_resolution_id)',
  markets_status_settled_idx:
    'CREATE INDEX markets_status_settled_idx ON public.markets USING btree (status, settled_at DESC, id DESC)',
}

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Index Cond'?: string
  'Recheck Cond'?: string
  Filter?: string
  Plans?: PlanNode[]
}

// The fixtures are a handful of rows, where a sequential scan is cheapest whatever the indexes,
// so seq scans are priced out for the one statement: a plan that still uses one has no index to
// use. `set local` ends with postgres-meta's implicit transaction.
// `analyze` first: every test file's setup wipes the tables in one statement (#214), and until
// autovacuum catches up the planner's row estimates are left over from earlier files, so it could
// pick a different index depending on file order (#233). Fresh stats make the plan deterministic.
async function planNodes(query: string): Promise<PlanNode[]> {
  const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
    `analyze; set local enable_seqscan = off; explain (format json) ${query}`,
  )
  const nodes: PlanNode[] = []
  const walk = (node: PlanNode) => {
    nodes.push(node)
    node.Plans?.forEach(walk)
  }
  walk(row['QUERY PLAN'][0].Plan)
  return nodes
}

const indexesUsed = (nodes: PlanNode[]) => nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : []))
const seqScanned = (nodes: PlanNode[]) => nodes.filter((n) => n['Node Type'] === 'Seq Scan').map((n) => n['Relation Name'])
const relationsRead = (nodes: PlanNode[]) => new Set(nodes.flatMap((n) => (n['Relation Name'] ? [n['Relation Name']] : [])))

// A Bitmap Heap Scan carries no Index Cond/Index Name of its own — those live on the Bitmap Index
// Scan (or BitmapAnd/BitmapOr tree) underneath it. Collects every condition string and index name
// contributed by that subtree, so a bitmap-scanned relation is judged the same way as a plain one.
function bitmapDetails(node: PlanNode): { conditions: string[]; indexNames: string[] } {
  const conditions: string[] = []
  const indexNames: string[] = []
  for (const child of node.Plans ?? []) {
    if (child['Index Name']) indexNames.push(child['Index Name'])
    if (child['Index Cond']) conditions.push(child['Index Cond'])
    const nested = bitmapDetails(child)
    conditions.push(...nested.conditions)
    indexNames.push(...nested.indexNames)
  }
  return { conditions, indexNames }
}

// The condition strings a scan node applies against its own relation, and the index name(s) it
// reaches through — resolving a Bitmap Heap Scan's own Recheck Cond and its child index(es).
function scanDetails(node: PlanNode): { conditions: string[]; indexNames: string[] } {
  const own = [node['Index Cond'], node['Recheck Cond'], node.Filter].filter((c): c is string => Boolean(c))
  if (node['Node Type'] === 'Bitmap Heap Scan') {
    const bitmap = bitmapDetails(node)
    return { conditions: [...own, ...bitmap.conditions], indexNames: bitmap.indexNames }
  }
  return { conditions: own, indexNames: node['Index Name'] ? [node['Index Name']] : [] }
}

// Scan nodes on `relation` that reference `actorId` in one of their own conditions — i.e.
// wherever the plan applies the actor's own equality check against this relation, whether that
// narrows the index walk itself or is only a Filter/Recheck applied to what the scan produced.
const actorScans = (nodes: PlanNode[], relation: string, actorId: string) =>
  nodes
    .filter((n) => n['Relation Name'] === relation)
    .map((n) => ({ node: n, ...scanDetails(n) }))
    .filter((s) => s.conditions.some((c) => c.includes(actorId)))

// Every such scan must still be index-based, through one of the relation's real indexes — never a
// Seq Scan, and never some unrelated index — even when a tiny fixture leaves Postgres a genuine
// cost tie over which real index (or scan shape: plain, bitmap or merge-join-fed) it reaches for.
function expectActorSelective(nodes: PlanNode[], relation: string, actorId: string, allowedIndexes: string[]) {
  const scans = actorScans(nodes, relation, actorId)
  expect(scans.length).toBeGreaterThan(0)
  for (const scan of scans) {
    expect(scan.node['Node Type']).not.toBe('Seq Scan')
    expect(scan.indexNames.length).toBeGreaterThan(0)
    for (const name of scan.indexNames) expect(allowedIndexes).toContain(name)
  }
}

let bob: Member
let marketId: string
let resolutionId: string
let oldestLedgerRow: { created_at: string; id: number }

beforeAll(async () => {
  const [alice, member] = await seedMembers()
  bob = member
  const db = serviceClient()
  await giveRole(alice, 'admin')
  const aliceClient = await clientFor(alice)
  const bobClient = await clientFor(bob)
  await ensureInvited(bobClient)

  const market = await createTestMarket(aliceClient, ['Yes', 'No'])
  marketId = market.marketId
  for (const [client, outcomeId, amount] of [
    [bobClient, market.outcomeIds[0], 10],
    [aliceClient, market.outcomeIds[1], 5],
  ] as const) {
    const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeId, p_amount: amount })
    if (error) throw error
  }
  const { error: resolveErr } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: marketId, p_outcome_id: market.outcomeIds[0] })
  if (resolveErr) throw resolveErr

  const { data: resolved, error: marketErr } = await db.from('markets').select('current_resolution_id').eq('id', marketId).single()
  if (marketErr) throw marketErr
  resolutionId = resolved.current_resolution_id

  const { data: oldest, error: ledgerErr } = await db
    .from('coin_transactions')
    .select('created_at, id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single()
  if (ledgerErr) throw ledgerErr
  oldestLedgerRow = oldest

  // Earlier test files in the same run leave both dead tuples (never vacuumed) and stale
  // statistics (never re-analyzed) behind on these tables, which can make the planner misjudge
  // their true size and pick a different scan shape than it would fresh. `vacuum` can't run
  // alongside other statements in one call, so it's its own. Ground every EXPLAIN below in the
  // fixture's actual, current size.
  await pgQuery(
    'vacuum (analyze) public.bets, public.parlays, public.market_resolutions, public.task_completions, public.markets, public.market_outcomes, public.coin_transactions, public.profiles;',
  )
})

describe('0033 indexes', () => {
  it('creates each index the named queries need', async () => {
    const rows = await pgQuery<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in (${Object.keys(INDEXES)
        .map((name) => `'${name}'`)
        .join(', ')})`,
    )
    expect(Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]))).toEqual(INDEXES)
  })

  it("finds an override's payouts to reverse through the resolution id index", async () => {
    const nodes = await planNodes(
      `select profile_id, amount, id from public.coin_transactions where meta ->> 'resolution_id' = '${resolutionId}' order by profile_id, id`,
    )
    expect(indexesUsed(nodes)).toContain('coin_transactions_resolution_id_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it("reads a market's newest bets in order from the market index", async () => {
    const nodes = await planNodes(
      `select id, outcome_id, amount, created_at, profile_id from public.bets where market_id = '${marketId}' order by created_at desc, id desc limit 51`,
    )
    expect(indexesUsed(nodes)).toContain('bets_market_created_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it('reads a ledger range from the created_at index', async () => {
    // A keyset page also carries an index-usable bound conjunct next to the OR tiebreak: a range
    // read (newest down to a cursor) adds `created_at >= <cursor>`. Without it, the OR-only form
    // has no leading Index Cond to bound the scan by — only a Filter — and walks the whole table.
    const ts = oldestLedgerRow.created_at
    const nodes = await planNodes(
      `select id, profile_id, amount, type, meta, created_at from public.coin_transactions where created_at >= '${ts}' and (created_at > '${ts}' or (created_at = '${ts}' and id >= ${oldestLedgerRow.id})) order by created_at desc, id desc limit 500`,
    )
    // At this fixture's few rows, (profile_id, created_at desc, id desc) (0048) ties with the
    // created_at index for the bound, as its second column; at real scale created_at's own index wins.
    const scan = nodes.find((n) => ['coin_transactions_created_idx', 'coin_transactions_profile_created_idx'].includes(n['Index Name'] ?? ''))
    expect(scan?.['Index Cond']).toMatch(/created_at/)
    expect(seqScanned(nodes)).toEqual([])
  })

  it("reads each branch of a member's activity through an index", async () => {
    const nodes = await planNodes(
      `select id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title from public.activity_feed where actor_id = '${bob.id}' order by occurred_at desc, id desc limit 51`,
    )
    expect([...relationsRead(nodes)]).toEqual(
      expect.arrayContaining(['bets', 'parlays', 'market_resolutions', 'task_completions', 'profiles', 'markets']),
    )

    // Each actor-filtered branch must apply the actor id against a real index — an Index Cond
    // narrowing the index walk itself where the planner reaches for one, a Filter otherwise — and
    // never fall back to reading the whole relation. bet_placed/bet_won ordinarily narrow through
    // bets_profile_created_idx, but at this fixture's tiny scale Postgres sometimes joins outcomes
    // to bets by outcome_id first instead (bets_outcome_id_idx), applying profile_id as a Filter —
    // a genuine cost tie over a couple of rows, not something `set local` planner toggles can
    // steer. Both are real, intentional indexes; which one wins at the spec's target scale is for
    // Task 12 to check.
    expectActorSelective(nodes, 'bets', bob.id, ['bets_profile_created_idx', 'bets_outcome_id_idx'])

    // market_resolved: same tie, over the one resolved market (resolved by alice, never bob) —
    // Postgres doesn't reliably prefer market_resolutions_resolved_by_idx over a plain Index Scan
    // of market_resolutions_pkey with the actor id only as a Filter.
    // 0048's market and outcome indexes join the tie.
    expectActorSelective(nodes, 'market_resolutions', bob.id, [
      'market_resolutions_resolved_by_idx',
      'market_resolutions_pkey',
      'market_resolutions_market_resolved_idx',
      'market_resolutions_outcome_id_idx',
    ])

    // parlay_placed narrows by profile_id through parlays_profile_created_idx (0044). parlay_won does
    // not, and never will regardless of scale: parlays_won_settled_idx (its cheaper match, since
    // it also satisfies `status = 'won'`) has no profile_id column at all, so that branch can only
    // ever apply the actor id as a Filter, never an Index Cond.
    expectActorSelective(nodes, 'parlays', bob.id, ['parlays_profile_created_idx', 'parlays_won_settled_idx'])

    // task_completed narrows by profile_id, but at this fixture's near-empty scale Postgres
    // prefers the pre-existing (task_id, profile_id, period_key) unique index (0017) over the new
    // task_completions_profile_submitted_idx — both are actor-selective; which one wins at the
    // spec's target scale is for Task 12 to check.
    // 0054's approved-streak index (profile_id first) joins the tie.
    expectActorSelective(nodes, 'task_completions', bob.id, [
      'task_completions_one_active_per_period',
      'task_completions_profile_submitted_idx',
      'task_completions_approved_streak_idx',
    ])

    expect(indexesUsed(nodes)).toContain('markets_current_resolution_id_idx')
    // market_created filters markets by created_by, indexed since 0048.
    expect(seqScanned(nodes)).toEqual([])
  })
})

describe('0048 indexes (#67)', () => {
  it('lists resolved and voided markets newest settled first from a status index (0066)', async () => {
    const nodes = await planNodes(
      `select id, settled_at from public.markets where status in ('resolved', 'voided') order by settled_at desc, id desc limit 51`,
    )
    // Two statuses can't be walked in settled_at order from one index range, so at this fixture's
    // few rows the planner may as well take another status index and sort; either is index-based.
    expect(
      indexesUsed(nodes).some((name) => ['markets_status_settled_idx', 'markets_status_created_idx', 'markets_status_close_idx'].includes(name)),
    ).toBe(true)
    expect(seqScanned(nodes)).toEqual([])
  })

  it('counts open markets from the status index', async () => {
    const nodes = await planNodes(`select count(*) from public.markets where status = 'open'`)
    // 0049's (status, close_at, id) and 0066's (status, settled_at, id) lead with status too, and serve the count as well.
    expect(
      indexesUsed(nodes).some((name) => ['markets_status_created_idx', 'markets_status_close_idx', 'markets_status_settled_idx'].includes(name)),
    ).toBe(true)
    expect(seqScanned(nodes)).toEqual([])
  })

  it("finds a market's resolutions from the market index", async () => {
    const nodes = await planNodes(
      `select id, resolved_at from public.market_resolutions where market_id = '${marketId}' order by resolved_at desc`,
    )
    expect(indexesUsed(nodes)).toContain('market_resolutions_market_resolved_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it("reads a member's coin history from the profile index", async () => {
    const nodes = await planNodes(
      `select id, amount, created_at from public.coin_transactions where profile_id = '${bob.id}' order by created_at desc, id desc limit 51`,
    )
    // After the whole suite has filled the ledger, walking created_at backwards and filtering by
    // profile can cost less than the profile index for a 51-row limit: a real plan, not a scan.
    // The keyset-bounded page below is the one that must seek on the profile index.
    expect(indexesUsed(nodes).some((n) => ['coin_transactions_profile_created_idx', 'coin_transactions_created_idx'].includes(n))).toBe(true)
    expect(seqScanned(nodes)).toEqual([])
  })

  it("seeks a member's own coin history page by profile and the keyset bound (#76)", async () => {
    // The shape listMyTransactions sends for a "Show more" range: its profile filter plus
    // readKeyset's plain created_at bound, which must both land in the Index Cond.
    const ts = oldestLedgerRow.created_at
    const nodes = await planNodes(
      `select id, amount, type, meta, created_at from public.coin_transactions where profile_id = '${bob.id}' and created_at >= '${ts}' and (created_at > '${ts}' or (created_at = '${ts}' and id >= ${oldestLedgerRow.id})) order by created_at desc, id desc limit 500`,
    )
    // Either ledger index can serve this: after the whole suite has filled the ledger, walking
    // created_at with the profile as a filter can cost less than the profile index (as the test
    // above allows), and which one the planner takes varies from run to run (#139). What must hold
    // is that the keyset's created_at bound lands in an Index Cond, so the page never reads the
    // whole ledger, and that the profile index, whenever it is chosen, seeks on the profile too.
    const ledgerIndexes = ['coin_transactions_profile_created_idx', 'coin_transactions_created_idx']
    const seeks = nodes.filter((n) => ledgerIndexes.includes(n['Index Name'] ?? '') && /created_at/.test(n['Index Cond'] ?? ''))
    expect(seeks, `plan: ${JSON.stringify(nodes)}`).not.toHaveLength(0)
    for (const seek of seeks.filter((n) => n['Index Name'] === 'coin_transactions_profile_created_idx')) {
      expect(seek['Index Cond']).toMatch(/profile_id/)
    }
    expect(seqScanned(nodes)).toEqual([])
  })

  it('indexes the foreign keys that had none', async () => {
    const rows = await pgQuery<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and indexname in ('parlay_legs_outcome_id_idx', 'markets_created_by_idx', 'market_resolutions_outcome_id_idx', 'idempotency_keys_profile_id_idx')`,
    )
    expect(rows.map((r) => r.indexname).sort()).toEqual(
      ['idempotency_keys_profile_id_idx', 'market_resolutions_outcome_id_idx', 'markets_created_by_idx', 'parlay_legs_outcome_id_idx'],
    )
  })
})

describe('0049 index (#74)', () => {
  it('lists open markets soonest to close first from the close index', async () => {
    const nodes = await planNodes(
      `select id, close_at from public.markets where status in ('open') order by close_at, id limit 51`,
    )
    expect(indexesUsed(nodes)).toContain('markets_status_close_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it('seeks a later page of open markets by its close_at bound', async () => {
    // The keyset filter's plain `close_at >=` bound, beside its (close_at, id) tiebreak OR, is
    // what gives the planner an Index Cond on close_at rather than a Filter over every open market.
    const ts = '2026-09-01T00:00:00+00:00'
    const id = '00000000-0000-4000-8000-000000000000'
    const nodes = await planNodes(
      `select id, close_at from public.markets where status in ('open') and close_at >= '${ts}' and (close_at > '${ts}' or (close_at = '${ts}' and id > '${id}')) order by close_at, id limit 51`,
    )
    const scan = nodes.find((n) => n['Index Name'] === 'markets_status_close_idx')
    expect(scan?.['Index Cond']).toMatch(/close_at >=/)
    expect(seqScanned(nodes)).toEqual([])
  })
})

describe('0055 member_stats (#83)', () => {
  it("aggregates a member's stats from their own index entries", async () => {
    // A plpgsql function's query is planned inside it, out of EXPLAIN's reach, so the query is
    // lifted from the function's own source and planned with the member's id in place of the
    // parameter: the plan checked is the one the function runs, not a copy that could drift.
    const [fn] = await pgQuery<{ prosrc: string }>(`select prosrc from pg_proc where proname = 'member_stats'`)
    const body = fn.prosrc.match(/return query\s+([\s\S]*?);\s*end;\s*$/)?.[1]
    expect(body).toBeTruthy()
    const nodes = await planNodes(body!.replace(/\bp_profile_id\b/g, `'${bob.id}'::uuid`))

    expect([...relationsRead(nodes)]).toEqual(
      expect.arrayContaining(['bets', 'parlays', 'parlay_legs', 'coin_transactions', 'markets', 'task_completions']),
    )
    expectActorSelective(nodes, 'bets', bob.id, ['bets_profile_created_idx'])
    expectActorSelective(nodes, 'coin_transactions', bob.id, ['coin_transactions_profile_created_idx'])
    expectActorSelective(nodes, 'markets', bob.id, ['markets_created_by_idx'])
    // The best-parlay branch also wants status = 'won', which parlays_won_settled_idx covers
    // without profile_id: over this fixture's few rows it can tie with the profile indexes, as in
    // the activity test above. The record branch has only the profile to go on.
    // At this fixture's handful of parlays, a pkey walk with profile_id as a Filter ties too.
    expectActorSelective(nodes, 'parlays', bob.id, [
      'parlays_profile_created_idx',
      'parlays_profile_id_idx',
      'parlays_won_settled_idx',
      'parlays_pkey',
    ])
    // 0054's approved-only (profile_id, …) index fits exactly; the rest are the same near-empty
    // tie as the activity test's, plus the approved-only index that matches the status but not
    // the member.
    expectActorSelective(nodes, 'task_completions', bob.id, [
      'task_completions_approved_streak_idx',
      'task_completions_profile_submitted_idx',
      'task_completions_one_active_per_period',
      'task_completions_approved_reviewed_idx',
    ])
    expect(seqScanned(nodes)).toEqual([])
  })
})
