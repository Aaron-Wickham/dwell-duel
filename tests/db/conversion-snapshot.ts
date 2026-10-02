import { serviceClient, setBalanceViaLedger, type TestClient } from './helpers'
import { pgQuery } from './pg-query'
import {
  seedMembers,
  makeMember,
  clientFor,
  createTestMarket,
  ensureInvited,
  giveRole,
  backLeg,
  backers,
  insertLockedParlay,
  type Member,
  type TestMarket,
} from './fixtures'
import { computeOdds, poolPayout } from '@/lib/markets/odds'
import { lmsrQuote } from '@/lib/markets/pricing'
import { lockedOddsToBp, potentialPayout } from '@/lib/parlays/odds'

// The snapshot tests/db/lmsr-conversion.test.ts converts (0105, #335), and the pool rules it is
// checked against. It's shaped like production: binary, multiple-choice (seeded, with an outcome nobody backed), over/under, closed
// but unresolved, untouched, resolved and voided markets; solo bets from several members, a
// cancelled bet; pending parlays with legs locked at placement (before 0074), locked at close, not
// locked yet, on a voided market, and one at both caps.

export type Name = 'bin' | 'multi' | 'gap' | 'ou' | 'closed' | 'quiet' | 'resolved' | 'voided'
export type ParlayName = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7'
export const CONVERTED: Name[] = ['bin', 'multi', 'gap', 'ou', 'closed', 'quiet']

export interface Snapshot {
  alice: Member
  bob: Member
  carol: Member
  dave: Member
  erin: Member
  olive: Member
  m: Record<Name, TestMarket>
  p: Record<ParlayName, string>
  client: (member: Member) => TestClient
}

let clients = new Map<string, TestClient>()
let m: Record<Name, TestMarket>
let olive: Member

const client = (member: Member) => clients.get(member.id)!

async function pool(member: Member, market: TestMarket, outcome: number, amount: number): Promise<number> {
  const { error } = await client(member).rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcome],
    p_amount: amount,
  })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('bets')
    .select('id')
    .eq('profile_id', member.id)
    .eq('outcome_id', market.outcomeIds[outcome])
    .order('id', { ascending: false })
    .limit(1)
    .single()
  if (readErr) throw readErr
  return data.id
}

async function poolParlay(member: Member, picks: [TestMarket, number][], stake: number): Promise<string> {
  const { data, error } = await client(member).rpc('place_parlay', {
    p_outcome_ids: picks.map(([market, i]) => market.outcomeIds[i]),
    p_stake: stake,
  })
  if (error) throw error
  return data as string
}

export async function close(market: TestMarket) {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', market.marketId)
  if (error) throw error
}

export async function resolve(market: TestMarket, outcome: number) {
  const { error } = await client(olive).rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcome],
    p_note: 'Settled by the test',
  })
  if (error) throw error
}

export async function voidMarket(market: TestMarket) {
  const { error } = await client(olive).rpc('void_market', { p_market_id: market.marketId, p_reason: 'Called off' })
  if (error) throw error
}

export async function convert(): Promise<{ markets: number; bets: number; parlays: number }> {
  const [row] = await pgQuery<{ result: { markets: number; bets: number; parlays: number } }>(
    'select public.convert_pool_markets_to_lmsr() as result',
  )
  return row.result
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [alice, bob] = await seedMembers()
  const carol = await makeMember('Carol')
  const dave = await makeMember('Dave')
  const erin = await makeMember('Erin')
  olive = await makeMember('Olive')
  await giveRole(olive, 'owner')
  clients = new Map()
  for (const member of [alice, bob, carol, dave, erin, olive]) {
    const c = await clientFor(member)
    await ensureInvited(c)
    clients.set(member.id, c)
    await setBalanceViaLedger(member.id, 2000)
  }
  for (const backer of await backers()) await setBalanceViaLedger(backer.id, 2000)

  const { data: ouId, error: ouErr } = await client(alice).rpc('create_market', {
    p_title: 'Goals',
    p_description: null as unknown as string,
    p_kind: 'over_under',
    p_outcome_labels: [],
    p_close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    p_line: 2.5,
  })
  if (ouErr) throw ouErr
  const { data: ouOutcomes } = await serviceClient().from('market_outcomes').select('id, label').eq('market_id', ouId as string)
  const ou = {
    marketId: ouId as string,
    outcomeIds: ['Over 2.5', 'Under 2.5'].map((label) => ouOutcomes!.find((o) => o.label === label)!.id),
  }

  m = {
    ou,
    bin: await createTestMarket(client(alice), ['Yes', 'No'], { title: 'Binary' }),
    multi: await createTestMarket(client(alice), ['A', 'B', 'C', 'D'], { title: 'Multi', seed: 10 }),
    gap: await createTestMarket(client(alice), ['Yes', 'No', 'Maybe'], { title: 'Gap' }),
    closed: await createTestMarket(client(alice), ['Yes', 'No'], { title: 'Closed', seed: 5 }),
    quiet: await createTestMarket(client(alice), ['Yes', 'No'], { title: 'Quiet', seed: 5 }),
    resolved: await createTestMarket(client(alice), ['Yes', 'No'], { title: 'Resolved' }),
    voided: await createTestMarket(client(alice), ['Yes', 'No'], { title: 'Voided' }),
  }

  await pool(bob, m.bin, 0, 30)
  await pool(carol, m.bin, 1, 10)
  await pool(dave, m.bin, 0, 20)
  const cancelled = await pool(erin, m.bin, 1, 5)
  await pool(bob, m.multi, 0, 40)
  await pool(carol, m.multi, 1, 15)
  await pool(dave, m.multi, 2, 5)
  await pool(erin, m.multi, 0, 10)
  await pool(bob, m.gap, 0, 20)
  await pool(carol, m.gap, 1, 30)
  await pool(bob, m.ou, 0, 10)
  await pool(dave, m.ou, 1, 25)
  await pool(carol, m.ou, 0, 5)
  await pool(carol, m.closed, 0, 12)
  await pool(erin, m.closed, 1, 8)
  await pool(bob, m.resolved, 1, 10)
  // The parlay floor (0074) on every market a parlay uses.
  await backLeg(m.bin, 0)
  await backLeg(m.multi, 1)
  await backLeg(m.ou, 0)
  await backLeg(m.closed, 1)
  await backLeg(m.resolved, 0)
  await backLeg(m.voided, 0)
  await backLeg(m.gap, 0)
  const { error: cancelErr } = await client(erin).rpc('cancel_bet', { p_bet_id: cancelled })
  if (cancelErr) throw cancelErr

  const p: Record<ParlayName, string> = {
    p1: await poolParlay(dave, [[m.bin, 0], [m.multi, 1]], 10),
    p2: await poolParlay(erin, [[m.closed, 1], [m.resolved, 0], [m.ou, 0]], 20),
    p3: await insertLockedParlay(carol.id, 15, [
      { market: m.bin, outcomeIndex: 0, lockedOdds: 1.8 },
      { market: m.ou, outcomeIndex: 1, lockedOdds: 2.25 },
    ]),
    p4: await poolParlay(bob, [[m.voided, 0], [m.bin, 1], [m.multi, 2]], 10),
    p5: await poolParlay(bob, [[m.closed, 0], [m.multi, 0]], 8),
    // Both legs count 5x, so 25x caps at 20x, and 60 x 20 caps at 1,000 DC.
    p6: await poolParlay(erin, [[m.multi, 2], [m.bin, 1]], 60),
    // 5 x 5 x 3.3333 caps at 20x; with the last leg voided, 25x still does.
    p7: await poolParlay(dave, [[m.bin, 1], [m.closed, 0], [m.gap, 1]], 40),
  }

  await close(m.closed)
  // Settles p2's legs on closed markets: both lock now. p5's leg on the closed market stays unlocked.
  await resolve(m.resolved, 0)
  await voidMarket(m.voided)
  return { alice, bob, carol, dave, erin, olive, m, p, client }
}

// ─── What members saw before ───────────────────────────────────────────────

export interface Before {
  pools: Map<string, Map<string, number>>
  chances: Map<string, number>
  bets: { id: number; profileId: string; marketId: string; outcomeId: string; amount: number }[]
  balances: Map<string, number>
  transactions: number
  parlays: Map<string, { stake: number; maxMultiplier: number; legs: { marketId: string; outcomeId: string; odds: number }[] }>
  sparklines: Map<string, unknown>
}

export async function record(): Promise<Before> {
  const db = serviceClient()
  const { data: markets, error } = await db
    .from('markets')
    .select('id, seed_per_outcome, market_outcomes(id, label, pool_total)')
    .in('id', CONVERTED.map((n) => m[n].marketId))
  if (error) throw error
  const pools = new Map<string, Map<string, number>>()
  const chances = new Map<string, number>()
  for (const market of markets) {
    pools.set(market.id, new Map(market.market_outcomes.map((o) => [o.id, o.pool_total])))
    for (const o of computeOdds(market.market_outcomes, market.seed_per_outcome)) {
      chances.set(o.outcomeId, o.impliedProbability ?? 1 / market.market_outcomes.length)
    }
  }

  const { data: bets, error: betsErr } = await db
    .from('bets')
    .select('id, profile_id, market_id, outcome_id, amount')
    .in('market_id', CONVERTED.map((n) => m[n].marketId))
  if (betsErr) throw betsErr

  const { data: profiles, error: profilesErr } = await db.from('profiles').select('id, balance')
  if (profilesErr) throw profilesErr
  const { count } = await db.from('coin_transactions').select('id', { count: 'exact', head: true })

  // What each leg's odds would be: locked ones keep theirs, the rest what pick_quote says now.
  const { data: rows, error: parlaysErr } = await db
    .from('parlays')
    .select('id, profile_id, stake, max_multiplier, parlay_legs(market_id, outcome_id, locked_odds)')
    .eq('status', 'pending')
  if (parlaysErr) throw parlaysErr
  const parlays: Before['parlays'] = new Map()
  for (const row of rows) {
    const legs = []
    for (const leg of row.parlay_legs) {
      let odds = leg.locked_odds === null ? null : Number(leg.locked_odds)
      if (odds === null) {
        const { data: quote, error: quoteErr } = await db.rpc('pick_quote', { p_profile_id: row.profile_id, p_outcome_id: leg.outcome_id })
        if (quoteErr) throw quoteErr
        odds = Number(quote[0].odds)
      }
      legs.push({ marketId: leg.market_id, outcomeId: leg.outcome_id, odds })
    }
    parlays.set(row.id, { stake: row.stake, maxMultiplier: row.max_multiplier, legs })
  }

  const sparklines = new Map<string, unknown>()
  const { data: series, error: seriesErr } = await client(olive).rpc('market_sparklines', {
    p_market_ids: CONVERTED.map((n) => m[n].marketId),
    p_points: 200,
  })
  if (seriesErr) throw seriesErr
  for (const s of series ?? []) sparklines.set(s.market_id, s.points)

  return {
    pools,
    chances,
    bets: bets.map((b) => ({ id: b.id, profileId: b.profile_id, marketId: b.market_id, outcomeId: b.outcome_id, amount: b.amount })),
    balances: new Map(profiles.map((r) => [r.id, r.balance])),
    transactions: count ?? 0,
    parlays,
    sparklines,
  }
}

// resolve_market_core under 0074's pool rules: the real pool split among the winners, and every bet
// refunded when nobody backed the winner.
export function poolRulePays(before: Before, bet: Before['bets'][number], winner: string): number {
  const pools = before.pools.get(bet.marketId)!
  const total = [...pools.values()].reduce((sum, x) => sum + x, 0)
  if (pools.get(winner) === 0) return bet.amount
  return bet.outcomeId === winner ? poolPayout(bet.amount, pools.get(winner)!, total) : 0
}

export type MarketState = { status: 'open' } | { status: 'voided' } | { status: 'resolved'; winner: string }

// 0074's settle_parlay: a lost leg loses it; a voided leg drops out; every leg voided refunds it; the
// rest multiply, capped at the parlay's cap and 1,000 DC.
export function poolRuleParlay(parlay: NonNullable<ReturnType<Before['parlays']['get']>>, stateOf: (marketId: string) => MarketState) {
  const states = parlay.legs.map((l) => ({ leg: l, state: stateOf(l.marketId) }))
  if (states.some(({ leg, state }) => state.status === 'resolved' && state.winner !== leg.outcomeId)) return { status: 'lost', credited: 0 }
  if (states.some(({ state }) => state.status === 'open')) return { status: 'pending', credited: 0 }
  const counted = states.filter(({ state }) => state.status !== 'voided')
  if (counted.length === 0) return { status: 'refunded', credited: parlay.stake }
  return {
    status: 'won',
    credited: potentialPayout(parlay.stake, counted.map(({ leg }) => lockedOddsToBp(leg.odds)), parlay.maxMultiplier),
  }
}

export async function marketStates(): Promise<(marketId: string) => MarketState> {
  const { data, error } = await serviceClient()
    .from('markets')
    .select('id, status, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id)')
  if (error) throw error
  const states = new Map<string, MarketState>(
    data.map((r) => [
      r.id,
      r.status === 'resolved'
        ? { status: 'resolved', winner: r.current_resolution!.outcome_id }
        : { status: r.status === 'voided' ? 'voided' : 'open' },
    ]),
  )
  return (id) => states.get(id)!
}

// What one resolution paid each member: its own ledger rows (bet_won, bet_refunded), apart from any
// parlay it settled and any earlier resolution it reversed.
export async function paidBy(marketId: string): Promise<Map<string, number>> {
  const { data: market } = await serviceClient().from('markets').select('current_resolution_id').eq('id', marketId).single()
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('profile_id, amount')
    .eq('meta->>resolution_id', market!.current_resolution_id!)
  if (error) throw error
  const paid = new Map<string, number>()
  for (const t of data) paid.set(t.profile_id, (paid.get(t.profile_id) ?? 0) + t.amount)
  return paid
}

export async function qOf(market: TestMarket): Promise<number[]> {
  const { data, error } = await serviceClient().from('market_outcomes').select('id, shares, q_offset').eq('market_id', market.marketId)
  if (error) throw error
  return market.outcomeIds.map((id) => {
    const row = data.find((o) => o.id === id)!
    return Number(row.shares) + Number(row.q_offset)
  })
}

export async function lmsrSolo(member: Member, market: TestMarket, outcome: number, amount: number): Promise<number> {
  const { shares, payout } = lmsrQuote(await qOf(market), 50, outcome, amount)
  const { error } = await client(member).rpc('place_slip_v4', {
    p_singles: [{ outcome_id: market.outcomeIds[outcome], amount, payout }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
  if (error) throw error
  return shares
}
