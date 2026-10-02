import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, setBalanceViaLedger } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backers } from './fixtures'
import { pgQuery } from './pg-query'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import { computeOdds, poolPayout } from '@/lib/markets/odds'
import { MAX_LEG_ODDS, MAX_MULTIPLIER, MAX_PAYOUT, MAX_PICKS, MIN_LEG_BETTORS, MIN_LEG_POOL, soloPayout } from '@/lib/parlays/odds'
import { getSlipView } from '@/lib/parlays/get-slip'

const SEED = 20

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const c of [aliceClient, bobClient]) await ensureInvited(c)
  await giveRole(alice, 'admin')
})

async function bet(client: TestClient, m: TestMarket, i: number, amount: number) {
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
  it('pays a winner their share of the real pool: the seed is never paid', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await bet(aliceClient, m, 1, 30)
    await resolve(m, 0)

    // floor(10 × 40 / 10) = 40, though the seeded odds showed 2.67×.
    expect(await balanceOf(bob)).toBe(100 - 10 + 40)
    const { data } = await serviceClient().from('coin_transactions').select('amount, meta').eq('profile_id', bob.id).eq('type', 'bet_won').single()
    expect(data?.amount).toBe(40)
    expect(data?.meta).toMatchObject({ seed_per_outcome: 0 })
    const [resolution] = await pgQuery<{ payout_seed: number }>(`select payout_seed from public.market_resolutions where market_id = '${m.marketId}'`)
    expect(resolution.payout_seed).toBe(0)

    // The slip's estimate predicts exactly what was paid, for a bet placed into the real pools as
    // they stood before it.
    expect(soloPayout(10, 0, 30)).toBe(40)
  })

  it('pays a lone winner their stake back', async () => {
    const m = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await resolve(m, 0)
    expect(await balanceOf(bob)).toBe(100)
  })

  it('pays a lone winner on a six-outcome market their stake back', async () => {
    await setBalanceViaLedger(bob.id, 500)
    const m = await createTestMarket(aliceClient, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], { seed: SEED })
    await bet(bobClient, m, 0, 500)
    await resolve(m, 0)
    expect(await balanceOf(bob)).toBe(500)
  })

  it('splits exactly the real pool among the winners, whoever lost', async () => {
    const m = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await bet(aliceClient, m, 1, 2)
    await bet(bobClient, m, 2, 5)
    await resolve(m, 0)
    // floor(10 × 17 / 10) = 17: Bob staked 15 and gets the whole 17 DC pool back.
    expect(await balanceOf(bob)).toBe(100 - 15 + 17)
    // The feed's oracle view works out the same payout the ledger made.
    const [view] = await pgQuery<{ amount: number }>(
      `select amount from public.activity_feed where kind = 'bet_won' and market_id = '${m.marketId}'`,
    )
    const [event] = await pgQuery<{ amount: number }>(
      `select amount from public.activity_events where kind = 'bet_won' and market_id = '${m.marketId}' and hidden_at is null`,
    )
    expect([view.amount, event.amount]).toEqual([17, 17])
  })

  it('works out a payout in TypeScript exactly as pool_payout does in SQL', async () => {
    const cases: [number, number, number, number, number][] = [
      [10, 10, 40, 0, 0],
      [7, 13, 52, 0, 0],
      [3, 8, 23, 0, 0],
      [999, 1000, 1001, 0, 0],
      [5, 5, 15, 20, 2],
      [11, 16, 46, 20, 2],
      [10, 10, 10, 20, 3],
    ]
    const sql = cases.map(([stake, w, t, seed, n], i) => `select ${i} as i, public.pool_payout(${stake}, ${w}, ${t}, ${seed}, ${n}) as paid`).join(' union all ')
    const rows = await pgQuery<{ i: number; paid: number }>(`${sql} order by 1`)
    expect(rows.map((r) => r.paid)).toEqual(cases.map(([stake, w, t, seed, n]) => poolPayout(stake, w, t, seed, n)))
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
    expect(view.amount).toBe(40)
    expect(event.amount).toBe(40)
  })

  it('prices parlay legs at close from real money only, never the seed', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'B' })
    const [first, second] = await backers()
    for (const m of [a, b]) {
      await bet(first.client, m, 0, 20)
      await bet(second.client, m, 1, 40)
    }
    const { data: parlayId, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[1]], p_stake: 5 })
    if (error) throw error
    await resolve(a, 0)
    await resolve(b, 1)
    const { data: legs } = await serviceClient().from('parlay_legs').select('market_id, locked_odds').eq('parlay_id', parlayId as string)
    const odds = Object.fromEntries((legs ?? []).map((l) => [l.market_id, Number(l.locked_odds)]))
    // A's Yes: 60 / 20 = 3.00, not the seeded (60 + 40) / 40 = 2.50. B's No: 60 / 40 = 1.50.
    expect(odds[a.marketId]).toBe(3)
    expect(odds[b.marketId]).toBe(1.5)
    const { data: parlay } = await serviceClient().from('parlays').select('status, credited').eq('id', parlayId as string).single()
    expect(parlay).toEqual({ status: 'won', credited: 22 })
  })

  // A brand-new market has seeded odds for solo bets, but no real money to price a parlay leg on.
  it('keeps a brand-new market nobody has bet on out of a parlay, in the slip and in the database', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'Fresh A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED, title: 'Fresh B' })
    const view = await getSlipView(bobClient, [
      { outcomeId: a.outcomeIds[0], parlay: true },
      { outcomeId: b.outcomeIds[1], parlay: true },
    ])
    expect(view.picks.map((p) => [p.legBlock, p.oddsBp])).toEqual([
      ['floor', 10_000],
      ['floor', 10_000],
    ])

    const { error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [],
      p_parlay_outcome_ids: [a.outcomeIds[0], b.outcomeIds[1]],
      p_parlay_stake: 5,
    })
    expect(error?.message).toMatch(/^parlay: 'Fresh [AB]' needs at least 50 DC from 2 other members before it can be a parlay pick$/)
  })

  it('draws seeded chances in the sparkline, as the market page computes them', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { seed: SEED })
    await bet(bobClient, m, 0, 10)
    await bet(aliceClient, m, 1, 30)
    const { data, error } = await aliceClient.rpc('market_sparklines', { p_market_ids: [m.marketId] })
    if (error) throw error
    const points = (data as unknown as { points: { shares: Record<string, number> }[] }[])[0].points
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
  it('matches the app’s MAX_PICKS, MAX_MULTIPLIER, MAX_PAYOUT, leg floor and leg cap', async () => {
    const [limits] = await pgQuery('select * from public.parlay_limits()')
    expect(limits).toEqual({
      max_legs: MAX_PICKS,
      max_multiplier: MAX_MULTIPLIER,
      max_payout: MAX_PAYOUT,
      min_leg_pool: MIN_LEG_POOL,
      min_leg_bettors: MIN_LEG_BETTORS,
      max_leg_odds: MAX_LEG_ODDS,
    })
  })

  it('cuts a parlay win to what the balance can hold, instead of aborting the resolve', async () => {
    const markets = await Promise.all(['A', 'B'].map((t) => createTestMarket(aliceClient, ['Yes', 'No'], { title: t })))
    const [first, second] = await backers()
    for (const m of markets) {
      await bet(first.client, m, 0, 25)
      await bet(second.client, m, 1, 25)
    }
    await setBalanceViaLedger(bob.id, 2_147_483_600)
    const { data: parlayId, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: markets.map((m) => m.outcomeIds[0]), p_stake: 100 })
    if (error) throw error
    // 2 x 2 = 4x pays 400, but only 147 fits under the integer ceiling.
    for (const m of markets) await resolve(m, 0)
    const { data } = await serviceClient().from('parlays').select('status, credited').eq('id', parlayId as string).single()
    expect(data).toEqual({ status: 'won', credited: 147 })
    expect(await balanceOf(bob)).toBe(2_147_483_647)
  })

  it('cuts a solo win the same way, and writes no ledger row for a credit that doesn’t fit at all', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Solo' })
    const n = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Full' })
    await bet(bobClient, m, 0, 10)
    await bet(bobClient, n, 0, 10)
    await bet(aliceClient, m, 1, 10)
    await bet(aliceClient, n, 1, 10)
    await setBalanceViaLedger(bob.id, 2_147_483_640)
    await resolve(m, 0)
    // The 20 DC win would pass the ceiling by 13.
    expect(await balanceOf(bob)).toBe(2_147_483_647)
    await resolve(n, 0)
    expect(await balanceOf(bob)).toBe(2_147_483_647)
    const { data: wins } = await serviceClient().from('coin_transactions').select('amount').eq('profile_id', bob.id).eq('type', 'bet_won')
    expect(wins).toEqual([{ amount: 7 }])
  })

  it('leaves a cut parlay credit alone when the parlay is settled again', async () => {
    const markets = await Promise.all(['A', 'B'].map((t) => createTestMarket(aliceClient, ['Yes', 'No'], { title: t })))
    const [first, second] = await backers()
    for (const m of markets) {
      await bet(first.client, m, 0, 25)
      await bet(second.client, m, 1, 25)
    }
    await setBalanceViaLedger(bob.id, 2_147_483_600)
    const { data: parlayId, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: markets.map((m) => m.outcomeIds[0]), p_stake: 100 })
    if (error) throw error
    for (const m of markets) await resolve(m, 0)
    const before = await pgQuery<{ n: number }>(`select count(*)::integer as n from public.coin_transactions where meta ->> 'parlay_id' = '${parlayId}'`)
    await pgQuery(`select public.settle_parlay('${parlayId}')`)
    const after = await pgQuery<{ n: number }>(`select count(*)::integer as n from public.coin_transactions where meta ->> 'parlay_id' = '${parlayId}'`)
    expect(after).toEqual(before)
    const { data } = await serviceClient().from('parlays').select('status, credited').eq('id', parlayId as string).single()
    expect(data).toEqual({ status: 'won', credited: 147 })
  })

  it('records the refund a cancelled bet really got when the balance is near the ceiling, and refuses one that can’t fit', async () => {
    const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Near the ceiling' })
    await bet(bobClient, m, 0, 10)
    await bet(bobClient, m, 1, 10)
    const { data: bets } = await serviceClient().from('bets').select('id').eq('market_id', m.marketId).eq('profile_id', bob.id).order('id')
    await setBalanceViaLedger(bob.id, 2_147_483_644)
    expect((await bobClient.rpc('cancel_bet', { p_bet_id: bets![0].id })).error).toBeNull()
    const { data: cancelled } = await serviceClient().from('cancelled_bets').select('amount').eq('id', bets![0].id).single()
    expect(cancelled).toEqual({ amount: 3 })
    expect(await balanceOf(bob)).toBe(2_147_483_647)
    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: bets![1].id })
    expect(error?.message).toBe("this balance is at its limit, so the bet can't be refunded")
  })
})
