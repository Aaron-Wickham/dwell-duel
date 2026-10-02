import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, type SlipSummary } from './helpers'
import { expectError } from './assertions'
import { pgQuery } from './pg-query'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, giveRole, type Member, type TestMarket } from './fixtures'
import { lmsrBuy, lmsrPrices } from '@/lib/markets/lmsr'
import { factorBp, fixedParlay, lmsrParlayQuote } from '@/lib/parlays/odds'
import { getParlayDetail } from '@/lib/parlays/get-parlay'
import { getSlipView } from '@/lib/parlays/get-slip'

// 0104 (#334): a parlay on lmsr markets splits its stake across its legs, each buying shares into
// the house parlay book, and its multiplier and payout are fixed when it's placed.
let alice: Member
let bob: Member
let carol: Member
let olive: Member
let aliceClient: TestClient
let bobClient: TestClient
let carolClient: TestClient
let oliveClient: TestClient
let m1: TestMarket
let m2: TestMarket
let m3: TestMarket

const B = 50

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  olive = await makeMember('Olive')
  await giveRole(olive, 'owner')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  oliveClient = await clientFor(olive)
  for (const client of [aliceClient, bobClient, carolClient, oliveClient]) await ensureInvited(client)
  m1 = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true, title: 'Leg one' })
  m2 = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true, title: 'Leg two' })
  m3 = await createTestMarket(aliceClient, ['A', 'B', 'C'], { lmsr: true, title: 'Leg three' })
})

type Pick = [TestMarket, number]

async function balanceOf(member: Member): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  if (error) throw error
  return data.balance
}

// The market maker's q for a market, in outcomeIds order, as the slip reads it.
async function qOf(m: TestMarket): Promise<number[]> {
  const { data, error } = await serviceClient().from('market_outcomes').select('id, shares, q_offset').eq('market_id', m.marketId)
  if (error) throw error
  return m.outcomeIds.map((id) => {
    const row = data.find((o) => o.id === id)!
    return Number(row.shares) + Number(row.q_offset)
  })
}

async function quote(picks: Pick[], stake: number) {
  const legs = await Promise.all(picks.map(async ([m, i]) => ({ q: await qOf(m), liquidity: B, index: i })))
  return lmsrParlayQuote(legs, stake)
}

async function parlay(client: TestClient, picks: Pick[], stake: number, opts: { payout?: number; key?: string } = {}) {
  const shown = opts.payout ?? (await quote(picks, stake)).payout
  return client.rpc('place_slip_v4', {
    p_singles: [],
    p_parlay_outcome_ids: picks.map(([m, i]) => m.outcomeIds[i]),
    p_parlay_stake: stake,
    p_parlay_payout: shown,
    p_idempotency_key: opts.key,
  })
}

async function placed(client: TestClient, picks: Pick[], stake: number): Promise<string> {
  const { data, error } = await parlay(client, picks, stake)
  if (error) throw error
  return (data as SlipSummary).parlay_id!
}

async function solo(client: TestClient, m: TestMarket, outcome: number, amount: number) {
  const shares = Math.floor(lmsrBuy(await qOf(m), B, outcome, amount) * 1e6) / 1e6
  const { error } = await client.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: m.outcomeIds[outcome], amount, payout: Math.floor(shares) }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
  if (error) throw error
}

async function parlayRow(id: string) {
  const { data, error } = await serviceClient()
    .from('parlays')
    .select('stake, status, credited, multiplier, payout, odds_at_close, parlay_legs(outcome_id, factor, shares, locked_odds)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

async function close(m: TestMarket) {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', m.marketId)
  if (error) throw error
}

async function resolve(client: TestClient, m: TestMarket, outcome: number) {
  return client.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[outcome], p_note: 'Settled by the test' })
}

async function settle(m: TestMarket, outcome: number) {
  await close(m)
  const { error } = await resolve(oliveClient, m, outcome)
  if (error) throw error
}

async function voidMarket(m: TestMarket) {
  const { error } = await oliveClient.rpc('void_market', { p_market_id: m.marketId, p_reason: 'Called off' })
  if (error) throw error
}

describe('placing an lmsr parlay', () => {
  it('splits the stake across the legs, stores each leg’s shares and factor, and fixes the multiplier and payout', async () => {
    const before = [await qOf(m1), await qOf(m2)]
    const expected = await quote([[m1, 0], [m2, 1]], 10)
    const { data, error } = await parlay(bobClient, [[m1, 0], [m2, 1]], 10, { payout: expected.payout })
    expect(error).toBeNull()
    const summary = data as SlipSummary
    expect(summary).toMatchObject({ solos: 0, replayed: false })
    expect(await balanceOf(bob)).toBe(90)

    const row = await parlayRow(summary.parlay_id!)
    // Each leg buys 5 DC of shares at its market's price.
    const legShares = [Math.floor(lmsrBuy(before[0], B, 0, 5) * 1e6) / 1e6, Math.floor(lmsrBuy(before[1], B, 1, 5) * 1e6) / 1e6]
    const leg1 = row.parlay_legs.find((l) => l.outcome_id === m1.outcomeIds[0])!
    const leg2 = row.parlay_legs.find((l) => l.outcome_id === m2.outcomeIds[1])!
    expect(Number(leg1.shares)).toBeCloseTo(legShares[0], 6)
    expect(Number(leg2.shares)).toBeCloseTo(legShares[1], 6)
    expect(leg1.locked_odds).toBeNull()
    // factor = 1 / average price = shares / (S/n), six places, rounded down.
    expect(Number(leg1.factor)).toBe(Math.floor((Number(leg1.shares) / 5) * 1e6) / 1e6)
    expect([Number(leg1.factor), Number(leg2.factor)]).toEqual(expected.factors)
    expect(Number(leg1.factor)).toBeGreaterThan(1)

    expect(Number(row.multiplier)).toBeCloseTo(Number(leg1.factor) * Number(leg2.factor), 12)
    expect(row.payout).toBe(Math.floor(10 * Number(leg1.factor) * Number(leg2.factor)))
    expect(row.payout).toBe(expected.payout)
    expect(fixedParlay(10, [leg1.factor!, leg2.factor!])).toEqual({ multiplierBp: expected.multiplierBp, payout: expected.payout })
    expect(factorBp(row.multiplier!)).toBe(expected.multiplierBp)
    expect(row.odds_at_close).toBe(false)
    expect(row.status).toBe('pending')

    // The book's shares moved each market's price, as S/n of solo stake would have.
    expect(await qOf(m1)).toEqual([legShares[0], 0])
    expect(await qOf(m2)).toEqual([0, legShares[1]])
    expect(lmsrPrices(await qOf(m1), B)[0]).toBeGreaterThan(lmsrPrices(before[0], B)[0])
    const { data: pools } = await serviceClient().from('market_outcomes').select('pool_total').in('market_id', [m1.marketId, m2.marketId])
    expect(pools!.every((p) => p.pool_total === 0)).toBe(true)
  })

  it('splits a stake that doesn’t divide evenly, and matches the slip’s quote to the DC', async () => {
    await solo(carolClient, m3, 2, 20)
    const picks: Pick[] = [[m1, 1], [m2, 0], [m3, 0]]
    const expected = await quote(picks, 10)
    const id = await placed(bobClient, picks, 10)
    const row = await parlayRow(id)
    expect(row.payout).toBe(expected.payout)
    for (const [m, i] of picks) {
      const leg = row.parlay_legs.find((l) => l.outcome_id === m.outcomeIds[i])!
      expect(Number(leg.factor)).toBeGreaterThanOrEqual(1)
      expect(Number(leg.shares)).toBeGreaterThan(0)
    }
  })

  it('refuses price_moved with the new payout when it is more than 2% under the one shown, and takes it within 2%', async () => {
    const expected = await quote([[m1, 0], [m2, 0]], 60)
    // Carol's bet moves the first leg's price before Bob places.
    await solo(carolClient, m1, 0, 40)
    const now = await quote([[m1, 0], [m2, 0]], 60)
    expect(now.payout).toBeLessThan(expected.payout * 0.98)
    const { error } = await parlay(bobClient, [[m1, 0], [m2, 0]], 60, { payout: expected.payout })
    expectError(error, `parlay: price_moved:${now.payout}`)
    expect(await balanceOf(bob)).toBe(100)

    const shown = Math.floor(now.payout / 0.985)
    expect(shown).toBeGreaterThan(now.payout)
    const { data, error: okError } = await parlay(bobClient, [[m1, 0], [m2, 0]], 60, { payout: shown })
    expect(okError).toBeNull()
    expect((await parlayRow((data as SlipSummary).parlay_id!)).payout).toBe(now.payout)
  })

  it('refuses a parlay without a shown payout', async () => {
    const { error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [],
      p_parlay_outcome_ids: [m1.outcomeIds[0], m2.outcomeIds[0]],
      p_parlay_stake: 10,
    })
    expectError(error, 'parlay: price_moved:')
    expect(await balanceOf(bob)).toBe(100)
  })

  it('takes 2 to 6 legs, one per market', async () => {
    const more = await Promise.all([4, 5, 6, 7].map((n) => createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true, title: `Leg ${n}` })))
    const seven: Pick[] = [[m1, 0], [m2, 0], [m3, 0], ...more.map((m): Pick => [m, 0])]
    expectError((await parlay(bobClient, seven, 7)).error, 'parlay: a parlay needs 2 to 6 picks')
    expectError((await parlay(bobClient, [[m1, 0]], 7)).error, 'parlay: a parlay needs 2 to 6 picks')
    expectError((await parlay(bobClient, [[m1, 0], [m1, 1]], 7)).error, 'parlay: each pick must be from a different market')
    expect(await balanceOf(bob)).toBe(100)

    const id = await placed(bobClient, seven.slice(0, 6), 7)
    expect((await parlayRow(id)).parlay_legs).toHaveLength(6)
    expect(await balanceOf(bob)).toBe(93)
  })

  it('takes a pick on the member’s own market, with no floor of other members’ money', async () => {
    const id = await placed(aliceClient, [[m1, 0], [m2, 0]], 10)
    expect((await parlayRow(id)).status).toBe('pending')
  })

  it('refuses a parlay that mixes in a pool market, and leaves pool parlays on their own rules', async () => {
    const pool = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await bobClient.rpc('place_slip_v4', {
      p_singles: [],
      p_parlay_outcome_ids: [m1.outcomeIds[0], pool.outcomeIds[0]],
      p_parlay_stake: 10,
      p_parlay_payout: 20,
    })
    expectError(error, "parlay: a parlay can't mix markets with fixed payouts and older markets")
    expect(await balanceOf(bob)).toBe(100)

    // Two pool markets go through place_parlay, whose floor still applies.
    const pool2 = await createTestMarket(aliceClient, ['Yes', 'No'])
    const poolOnly = await bobClient.rpc('place_slip_v4', {
      p_singles: [],
      p_parlay_outcome_ids: [pool.outcomeIds[0], pool2.outcomeIds[0]],
      p_parlay_stake: 10,
    })
    expectError(poolOnly.error, 'before it can be a parlay pick')
  })

  it('refuses a closed market, a stake over 1,000,000 DC and more than the balance', async () => {
    expectError((await parlay(bobClient, [[m1, 0], [m2, 0]], 1_000_001, { payout: 1 })).error, 'parlay: a parlay can stake at most 1,000,000 DC')
    expectError((await parlay(bobClient, [[m1, 0], [m2, 0]], 101)).error, { code: '23514', message: 'profiles_balance_check' })
    await close(m2)
    expectError((await parlay(bobClient, [[m1, 0], [m2, 0]], 10, { payout: 30 })).error, "parlay: 'Leg two' is no longer open")
    expect(await balanceOf(bob)).toBe(100)
  })

  it('returns the first result on a retry with the same key, placing once', async () => {
    const key = crypto.randomUUID()
    const first = await parlay(bobClient, [[m1, 0], [m2, 0]], 10, { key })
    const second = await parlay(bobClient, [[m1, 0], [m2, 0]], 10, { key })
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(second.data).toEqual({ ...(first.data as SlipSummary), replayed: true })
    expect(await balanceOf(bob)).toBe(90)
    const { count } = await serviceClient().from('parlays').select('id', { count: 'exact', head: true }).eq('profile_id', bob.id)
    expect(count).toBe(1)
  })
})

describe('the older paths', () => {
  it('leave place_slip_v3 and place_parlay refusing an lmsr leg, and place_lmsr_parlay internal', async () => {
    const v3 = await bobClient.rpc('place_slip_v3', {
      p_singles: [],
      p_parlay_outcome_ids: [m1.outcomeIds[0], m2.outcomeIds[0]],
      p_parlay_stake: 5,
    })
    expectError(v3.error, "parlay: a pick on a market with fixed payouts can't be in a parlay yet")
    const direct = await bobClient.rpc('place_parlay', { p_outcome_ids: [m1.outcomeIds[0], m2.outcomeIds[0]], p_stake: 5 })
    expectError(direct.error, 'DwellDuel just updated. Refresh to bet.')
    const internal = await bobClient.rpc('place_lmsr_parlay', {
      p_outcome_ids: [m1.outcomeIds[0], m2.outcomeIds[0]],
      p_stake: 5,
      p_payout: 10,
    })
    expectError(internal.error, { code: '42501', message: 'permission denied' })
    expect(await balanceOf(bob)).toBe(100)
  })

  it('keep a leg’s figures matching its market however it is written', async () => {
    const pool = await createTestMarket(aliceClient, ['Yes', 'No'])
    // One statement each, so the refused leg takes its parlay with it.
    const insertLeg = (m: TestMarket, figures: string) =>
      pgQuery(`
        with p as (insert into public.parlays (profile_id, stake, max_multiplier) values ('${bob.id}', 5, 20) returning id)
        insert into public.parlay_legs (parlay_id, market_id, outcome_id, factor, shares)
        select p.id, '${m.marketId}', '${m.outcomeIds[0]}', ${figures} from p
      `)
    await expect(insertLeg(m1, 'null, null')).rejects.toThrow(/needs its factor and shares/)
    await expect(insertLeg(pool, '2, 2.5')).rejects.toThrow(/only a parlay leg on a market with fixed payouts/)
  })
})

describe('settling an lmsr parlay', () => {
  it('pays the stored payout when every leg wins', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const { payout } = await parlayRow(id)
    await settle(m1, 0)
    expect((await parlayRow(id)).status).toBe('pending')
    await settle(m2, 1)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: payout })
    expect(await balanceOf(bob)).toBe(90 + payout!)
  })

  it('pays nothing when any leg loses', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    await settle(m1, 1)
    expect(await parlayRow(id)).toMatchObject({ status: 'lost', credited: 0 })
    await settle(m2, 1)
    expect(await parlayRow(id)).toMatchObject({ status: 'lost', credited: 0 })
    expect(await balanceOf(bob)).toBe(90)
  })

  it('drops a voided leg and pays floor(stake x the other factors)', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1], [m3, 2]], 30)
    const legs = (await parlayRow(id)).parlay_legs
    const factorOf = (m: TestMarket, i: number) => legs.find((l) => l.outcome_id === m.outcomeIds[i])!.factor!
    await voidMarket(m2)
    await settle(m1, 0)
    await settle(m3, 2)
    const expected = fixedParlay(30, [factorOf(m1, 0), factorOf(m3, 2)]).payout
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: expected })
    expect(await balanceOf(bob)).toBe(70 + expected)
  })

  it('pays at the last leg’s factor when one leg is left', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const leg = (await parlayRow(id)).parlay_legs.find((l) => l.outcome_id === m1.outcomeIds[0])!
    await voidMarket(m2)
    await settle(m1, 0)
    const expected = Math.floor(10 * Number(leg.factor))
    expect(expected).toBeGreaterThan(10)
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: expected })
  })

  it('refunds the stake when every leg is voided', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    await voidMarket(m1)
    await voidMarket(m2)
    expect(await parlayRow(id)).toMatchObject({ status: 'refunded', credited: 10 })
    expect(await balanceOf(bob)).toBe(100)
  })

  it('takes a win back when an override turns a leg into a loss, and pays again when it turns back', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const { payout } = await parlayRow(id)
    await settle(m1, 0)
    await settle(m2, 1)
    expect(await balanceOf(bob)).toBe(90 + payout!)
    expect((await resolve(oliveClient, m2, 0)).error).toBeNull()
    expect(await parlayRow(id)).toMatchObject({ status: 'lost', credited: 0 })
    expect(await balanceOf(bob)).toBe(90)
    expect((await resolve(oliveClient, m2, 1)).error).toBeNull()
    expect(await parlayRow(id)).toMatchObject({ status: 'won', credited: payout })
  })

  it('keeps the book’s shares in the market after it resolves', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const leg = (await parlayRow(id)).parlay_legs.find((l) => l.outcome_id === m1.outcomeIds[0])!
    await settle(m1, 1)
    expect((await qOf(m1))[0]).toBe(Number(leg.shares))
  })
})

describe('reads of an lmsr parlay', () => {
  it('give the slip an lmsr pick as a parlay leg, unblocked', async () => {
    const view = await getSlipView(bobClient, [
      { outcomeId: m1.outcomeIds[0], parlay: true },
      { outcomeId: m2.outcomeIds[0], parlay: true },
    ])
    expect(view.picks.map((p) => p.legBlock)).toEqual([null, null])
    expect(view.picks.every((p) => p.lmsr !== undefined)).toBe(true)
  })

  it('show its exact figures, and each leg’s factor as its known odds', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const row = await parlayRow(id)
    const detail = await getParlayDetail(carolClient, id)
    expect(detail).toMatchObject({ fixed: true, estimated: false, capped: false, potentialPayout: row.payout })
    expect(detail!.multiplierBp).toBe(factorBp(row.multiplier!))
    expect(detail!.legs.every((l) => l.oddsKnown)).toBe(true)

    const { data: odds } = await carolClient.rpc('parlay_leg_odds', { p_parlay_ids: [id] })
    expect(odds!.every((o) => o.known)).toBe(true)
    expect(odds!.map((o) => Number(o.odds)).sort()).toEqual(row.parlay_legs.map((l) => Number(l.factor)).sort())

    // A voided leg drops out of the figures too.
    await voidMarket(m2)
    const after = await getParlayDetail(carolClient, id)
    const leg1 = row.parlay_legs.find((l) => l.outcome_id === m1.outcomeIds[0])!
    const left = fixedParlay(10, [leg1.factor!])
    expect(after).toMatchObject({ multiplierBp: left.multiplierBp, potentialPayout: left.payout })
  })

  it('count it as riding on each leg’s pick while it is pending', async () => {
    await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const { data } = await carolClient.rpc('market_parlay_riding', { p_market_id: m1.marketId })
    expect(data).toEqual([{ outcome_id: m1.outcomeIds[0], riding: 10 }])
  })

  it('chart a leg as a point at the price after it', async () => {
    await solo(carolClient, m1, 1, 10)
    await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const { data, error } = await bobClient.rpc('market_sparklines', { p_market_ids: [m1.marketId] })
    if (error) throw error
    const points = (data as unknown as { points: { shares: Record<string, number> }[] }[])[0].points
    expect(points).toHaveLength(2)
    const prices = lmsrPrices(await qOf(m1), B)
    expect(points[1].shares[m1.outcomeIds[0]]).toBeCloseTo(prices[0], 10)
    expect(points[1].shares[m1.outcomeIds[1]]).toBeCloseTo(prices[1], 10)
  })
})

describe('stats, awards and the economy', () => {
  it('count the stored multiplier as the best parlay, or the factors left after a void', async () => {
    const id = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const row = await parlayRow(id)
    await settle(m1, 0)
    await settle(m2, 1)
    const { data: stats } = await bobClient.rpc('member_stats', { p_profile_id: bob.id }).single()
    expect(Number(stats!.best_parlay_multiplier)).toBe(Math.trunc(Number(row.multiplier) * 1e4) / 1e4)
    expect(stats!.best_parlay_payout).toBe(row.payout)
    const { data: awards } = await bobClient.rpc('leaderboard_awards')
    const best = awards!.find((a) => a.kind === 'best_parlay')!
    expect(best).toMatchObject({ profile_id: bob.id, detail: id })
    expect(Number(best.value)).toBe(Number(stats!.best_parlay_multiplier))
  })

  it('count a parlay with a voided leg at the factors left', async () => {
    const id = await placed(carolClient, [[m3, 0], [m1, 0]], 10)
    const leg = (await parlayRow(id)).parlay_legs.find((l) => l.outcome_id === m3.outcomeIds[0])!
    await voidMarket(m1)
    await settle(m3, 0)
    const { data: stats } = await carolClient.rpc('member_stats', { p_profile_id: carol.id }).single()
    expect(Number(stats!.best_parlay_multiplier)).toBe(Math.trunc(Number(leg.factor) * 1e4) / 1e4)
  })

  it('book a fixed parlay’s result on the market maker line', async () => {
    type Row = Record<string, number | string>
    const summary = async () => {
      const { data, error } = await oliveClient.rpc('economy_summary', { p_month_start: new Date().toISOString() }).single()
      if (error) throw error
      return Object.fromEntries(Object.entries(data as Row).map(([k, v]) => [k, Number(v)]))
    }
    const lost = await placed(bobClient, [[m1, 0], [m2, 1]], 10)
    const won = await placed(carolClient, [[m1, 1], [m3, 0]], 10)
    let s = await summary()
    expect(s.parlays_at_stake).toBe(20)
    expect(s.all_time_added - s.all_time_removed).toBe(s.balances + s.bets_at_stake + s.parlays_at_stake)

    await settle(m1, 1)
    await settle(m3, 0)
    const { payout } = await parlayRow(won)
    expect((await parlayRow(lost)).status).toBe('lost')
    s = await summary()
    // Bob's 10 DC stayed with the house; Carol's win paid out payout - 10.
    expect(s.market_maker_added).toBe(payout! - 10)
    expect(s.market_maker_removed).toBe(10)
    expect(s.house_parlays_added + s.house_parlays_removed).toBe(0)
    expect(s.all_time_added - s.all_time_removed).toBe(s.balances + s.bets_at_stake + s.parlays_at_stake)
  })
})

describe('a stake in your own market (0104)', () => {
  async function canResolve(client: TestClient, m: TestMarket): Promise<boolean> {
    const { data, error } = await client.rpc('can_resolve_market', { p_market_id: m.marketId })
    if (error) throw error
    return data as boolean
  }

  it('stops the creator resolving a market their pending parlay has a leg on', async () => {
    await placed(aliceClient, [[m1, 0], [m2, 0]], 10)
    await close(m1)
    expect(await canResolve(aliceClient, m1)).toBe(false)
    expectError((await resolve(aliceClient, m1, 0)).error, 'you have a stake in this market, so someone else resolves it')
  })

  it('still counts the leg once the parlay has lost elsewhere, since an override could revive it', async () => {
    const id = await placed(aliceClient, [[m1, 0], [m2, 0]], 10)
    await settle(m2, 1)
    expect((await parlayRow(id)).status).toBe('lost')
    await close(m1)
    expect(await canResolve(aliceClient, m1)).toBe(false)
    expectError((await resolve(aliceClient, m1, 0)).error, 'you have a stake in this market, so someone else resolves it')
    // Someone without a stake still can.
    expect(await canResolve(oliveClient, m1)).toBe(true)
  })

  it('stops the creator voiding a market they have a bet or a parlay leg on, on lmsr and pool markets alike; an admin still can', async () => {
    await solo(aliceClient, m1, 0, 5)
    await placed(aliceClient, [[m2, 0], [m3, 0]], 10)
    const pool = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error: poolBet } = await aliceClient.rpc('place_bet', { p_market_id: pool.marketId, p_outcome_id: pool.outcomeIds[0], p_amount: 5 })
    if (poolBet) throw poolBet
    for (const m of [m1, m2, pool]) {
      const { error } = await aliceClient.rpc('void_market', { p_market_id: m.marketId, p_reason: 'Called off' })
      expectError(error, 'you have a stake in this market, so ask an admin to void it')
    }
    // With no stake of her own, the creator still voids her market.
    const clean = await createTestMarket(aliceClient, ['Yes', 'No'], { lmsr: true })
    await solo(bobClient, clean, 0, 5)
    expect((await aliceClient.rpc('void_market', { p_market_id: clean.marketId, p_reason: 'Called off' })).error).toBeNull()
    await voidMarket(m1)
    expect(await balanceOf(alice)).toBe(100 - 10 - 5)
  })
})
