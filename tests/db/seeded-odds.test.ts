import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import { computeOdds, effectivePools } from '@/lib/markets/odds'
import { legOddsBp, MAX_MULTIPLIER, MAX_PICKS, soloPayout } from '@/lib/parlays/odds'
import { getSlipView } from '@/lib/parlays/get-slip'

const SEED = 20

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
})

async function bet(client: SupabaseClient, m: TestMarket, i: number, amount: number) {
  const { error } = await client.rpc('place_bet', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[i], p_amount: amount })
  if (error) throw error
}

async function resolve(m: TestMarket, i: number) {
  const { error } = await aliceClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: m.marketId, p_outcome_id: m.outcomeIds[i] })
  if (error) throw error
}

async function balanceOf(member: Member): Promise<number> {
  const { data } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  return data?.balance as number
}

describe('seeded markets (0041)', () => {
  it('seeds every new market with 20 DC per outcome by default', async () => {
    const { data: id, error } = await aliceClient.rpc('create_market', {
      p_title: 'Fresh',
      p_description: null,
      p_kind: 'binary',
      p_outcome_labels: ['Yes', 'No'],
      p_close_at: new Date(Date.now() + 3_600_000).toISOString(),
    })
    if (error) throw error
    const { data } = await serviceClient().from('markets').select('seed_per_outcome').eq('id', id as string).single()
    expect(data?.seed_per_outcome).toBe(SEED)
  })

  it('pays a binary winner on seeded pools, and records the seed in the ledger', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await bet(aliceClient, m, 1, 30)
    await resolve(m, 0)

    // floor(10 × (40 + 2×20) / (10 + 20)) = floor(26.67) = 26
    expect(await balanceOf(bob)).toBe(100 - 10 + 26)
    const { data } = await serviceClient().from('coin_transactions').select('amount, meta').eq('profile_id', bob.id).eq('type', 'bet_won').single()
    expect(data?.amount).toBe(26)
    expect(data?.meta).toMatchObject({ seed_per_outcome: SEED })

    // The slip's estimate (soloPayout on effective pools) predicts exactly what was paid, for a
    // bet placed into the pools as they stood before it.
    const before = effectivePools(0, 30, SEED, 2)
    expect(soloPayout(10, before.pool, before.total)).toBe(26)
  })

  it('pays a one-sided winner more than the stake: no more 1.00×', async () => {
    const m = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await resolve(m, 0)
    // floor(10 × (10 + 3×20) / (10 + 20)) = floor(23.33) = 23
    expect(await balanceOf(bob)).toBe(100 - 10 + 23)
  })

  it('still refunds everyone when nobody bet on the winner', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await resolve(m, 1)
    expect(await balanceOf(bob)).toBe(100)
  })

  it('shows the payout the feed oracle computes, so activity_feed and activity_events agree', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await bet(aliceClient, m, 1, 30)
    await resolve(m, 0)
    const [view] = await pgQuery<{ amount: number }>(
      `select amount from public.activity_feed where kind = 'bet_won' and market_id = '${m.marketId}'`,
    )
    const [event] = await pgQuery<{ amount: number }>(
      `select amount from public.activity_events where kind = 'bet_won' and market_id = '${m.marketId}' and hidden_at is null`,
    )
    expect(view.amount).toBe(26)
    expect(event.amount).toBe(26)
  })

  it('locks parlay legs at seeded odds, even on outcomes nobody has bet on', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'B' })
    await bet(aliceClient, b, 0, 10)
    const { data: parlayId, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[1]], p_stake: 5 })
    if (error) throw error
    const { data: legs } = await serviceClient().from('parlay_legs').select('market_id, locked_odds').eq('parlay_id', parlayId as string)
    const odds = Object.fromEntries((legs ?? []).map((l) => [l.market_id, Number(l.locked_odds)]))
    // A: 40 / 20 = 2.00. B's No: (10 + 40) / 20 = 2.50.
    expect(odds[a.marketId]).toBe(2)
    expect(odds[b.marketId]).toBe(2.5)
    // The app's own seeded odds agree to the basis point.
    const bNo = effectivePools(0, 10, SEED, 2)
    expect(legOddsBp(bNo.total, bNo.pool)).toBe(25_000)
  })

  // #51: the slip is how members build parlays, so check its whole path on markets nobody has
  // bet on yet: the slip prices every leg (so Parlay isn't greyed out) and place_slip accepts them.
  it('lets the slip parlay outcomes on brand-new markets that nobody has bet on', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'Fresh A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'Fresh B' })
    const view = await getSlipView(bobClient, [
      { outcomeId: a.outcomeIds[0], parlay: true },
      { outcomeId: b.outcomeIds[1], parlay: true },
    ], bob.id)
    expect(view.picks.map((p) => p.oddsBp)).toEqual([20_000, 20_000])
    expect(view.multiplierBp).toBe(40_000)

    const { error } = await bobClient.rpc('place_slip', {
      p_singles: [],
      p_parlay_outcome_ids: [a.outcomeIds[0], b.outcomeIds[1]],
      p_parlay_stake: 5,
    })
    expect(error).toBeNull()
    const { data: legs } = await serviceClient().from('parlay_legs').select('locked_odds').in('outcome_id', [a.outcomeIds[0], b.outcomeIds[1]])
    expect((legs ?? []).map((l) => Number(l.locked_odds))).toEqual([2, 2])
  })

  it('draws seeded chances in the sparkline, as the market page computes them', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await bet(aliceClient, m, 1, 30)
    const { data, error } = await aliceClient.rpc('market_sparklines', { p_market_ids: [m.marketId] })
    if (error) throw error
    const points = (data as { points: { shares: Record<string, number> }[] }[])[0].points
    const { data: bets } = await serviceClient().from('bets').select('outcome_id, amount, created_at').eq('market_id', m.marketId).order('created_at').order('id')
    const series = buildProbabilitySeries(
      m.outcomeIds,
      (bets ?? []).map((b) => ({ outcomeId: b.outcome_id as string, amount: b.amount as number, createdAt: b.created_at as string })),
      { seed: SEED },
    )
    expect(points).toHaveLength(series.length)
    points.forEach((p, i) => {
      for (const id of m.outcomeIds) expect(p.shares[id]).toBeCloseTo(series[i].shares[id], 12)
    })
    // After both bets: Yes (10+20)/(40+40) = 37.5%, the same chance the outcome rows show.
    expect(points.at(-1)!.shares[m.outcomeIds[0]]).toBeCloseTo(0.375, 12)
    const rows = computeOdds([{ id: 'y', label: 'Yes', pool_total: 10 }, { id: 'n', label: 'No', pool_total: 30 }], SEED)
    expect(rows[0].impliedProbability).toBeCloseTo(0.375, 12)
  })
})

describe('parlay_limits', () => {
  it('matches the app’s MAX_PICKS and MAX_MULTIPLIER', async () => {
    const [limits] = await pgQuery<{ max_legs: number; max_multiplier: number }>('select * from public.parlay_limits()')
    expect(limits).toEqual({ max_legs: MAX_PICKS, max_multiplier: MAX_MULTIPLIER })
  })

  it('never overflows a huge capped payout into an aborted resolve', async () => {
    const markets = await Promise.all(['A', 'B'].map((t) => createTestMarket(aliceClient, ['Yes', 'No'], { title: t })))
    await serviceClient().from('profiles').update({ balance: 1000 }).eq('id', alice.id)
    for (const m of markets) {
      await bet(aliceClient, m, 0, 1)
      await bet(aliceClient, m, 1, 99)
    }
    // Give Bob a stake whose 100x would pass the integer ceiling.
    await serviceClient().from('profiles').update({ balance: 30_000_000 }).eq('id', bob.id)
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: markets.map((m) => m.outcomeIds[0]), p_stake: 30_000_000 })
    if (error) throw error
    for (const m of markets) await resolve(m, 0)
    const { data } = await serviceClient().from('parlays').select('status, credited').eq('profile_id', bob.id).single()
    expect(data).toEqual({ status: 'won', credited: 2_147_483_647 })
  })
})
