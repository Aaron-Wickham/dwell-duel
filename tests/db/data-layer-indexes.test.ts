import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
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
}

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  Plans?: PlanNode[]
}

// The fixtures are a handful of rows, where a sequential scan is cheapest whatever the indexes,
// so seq scans are priced out for the one statement: a plan that still uses one has no index to
// use. `set local` ends with postgres-meta's implicit transaction.
async function planNodes(query: string): Promise<PlanNode[]> {
  const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
    `set local enable_seqscan = off; explain (format json) ${query}`,
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

let bob: Member
let marketId: string
let resolutionId: string
let oldestLedgerRow: { created_at: string; id: number }

beforeAll(async () => {
  const [alice, member] = await seedMembers()
  bob = member
  const db = serviceClient()
  await db.from('profiles').update({ is_admin: true }).eq('id', alice.id)
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
  const { error: resolveErr } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: market.outcomeIds[0] })
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
    const ts = oldestLedgerRow.created_at
    const nodes = await planNodes(
      `select id, profile_id, amount, type, meta, created_at from public.coin_transactions where created_at > '${ts}' or (created_at = '${ts}' and id >= ${oldestLedgerRow.id}) order by created_at desc, id desc limit 500`,
    )
    expect(indexesUsed(nodes)).toContain('coin_transactions_created_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it("reads each branch of a member's activity through an index", async () => {
    const nodes = await planNodes(
      `select id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title from public.activity_feed where actor_id = '${bob.id}' order by occurred_at desc, id desc limit 51`,
    )
    expect([...relationsRead(nodes)]).toEqual(
      expect.arrayContaining(['bets', 'parlays', 'market_resolutions', 'task_completions', 'profiles', 'markets']),
    )
    expect(indexesUsed(nodes)).toContain('markets_current_resolution_id_idx')
    // The one exception, as the spec intends: market_created filters markets by created_by, which
    // has no index.
    expect(seqScanned(nodes)).toEqual(['markets'])
  })
})
