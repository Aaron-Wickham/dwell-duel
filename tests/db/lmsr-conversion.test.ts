import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { pgQuery } from './pg-query'
import type { Member, TestMarket } from './fixtures'
import {
  CONVERTED,
  buildSnapshot,
  convert,
  lmsrSolo,
  marketStates,
  paidBy,
  poolRulePays,
  poolRuleParlay,
  record,
  resolve,
  voidMarket,
  type Name,
  type ParlayName,
} from './conversion-snapshot'
import { poolPayout } from '@/lib/markets/odds'
import { marketOdds } from '@/lib/markets/pricing'
import { getMarket } from '@/lib/markets/get-market'
import { getMarketPosition, getPositionKeys } from '@/lib/markets/position'
import { lockedOddsToBp, potentialPayout } from '@/lib/parlays/odds'
import { getParlayDetail } from '@/lib/parlays/get-parlay'

// 0105 (#335): every open pool market and pending pool parlay converts to fixed payouts at release,
// and nobody's expected payout, chance shown or balance changes. conversion-snapshot.ts builds a
// production-shaped snapshot and holds the pool rules (0074) every figure is checked against.

let alice: Member
let bob: Member
let carol: Member
let dave: Member
let erin: Member
let m: Record<Name, TestMarket>
let p: Record<ParlayName, string>
let client: (member: Member) => TestClient

beforeEach(async () => {
  ;({ alice, bob, carol, dave, erin, m, p, client } = await buildSnapshot())
}, 60_000)

// ─── The conversion ──────────────────────────────────────────────────────────

describe('converting at release', () => {
  it('keeps every bet’s Pays ~, every chance, every balance and every parlay’s payout', async () => {
    const before = await record()
    expect(await convert()).toEqual({ markets: CONVERTED.length, bets: before.bets.length, parlays: 7 })

    const db = serviceClient()
    const { data: markets } = await db.from('markets').select('id, pricing, liquidity')
    for (const name of CONVERTED) expect(markets!.find((r) => r.id === m[name].marketId)).toMatchObject({ pricing: 'lmsr', liquidity: 50 })
    for (const name of ['resolved', 'voided'] as const) expect(markets!.find((r) => r.id === m[name].marketId)!.pricing).toBe('pool')

    // Each bet's shares are the "Pays ~" it showed, so what it pays is now fixed at that figure.
    const { data: bets } = await db.from('bets').select('id, amount, cost, shares, converted, refund_outcomes, market_id, outcome_id')
    for (const was of before.bets) {
      const bet = bets!.find((b) => b.id === was.id)!
      const pools = before.pools.get(was.marketId)!
      const total = [...pools.values()].reduce((sum, x) => sum + x, 0)
      expect(Number(bet.shares)).toBe(poolPayout(was.amount, pools.get(was.outcomeId)!, total))
      expect(bet).toMatchObject({ cost: was.amount, amount: was.amount, converted: true })
      const unbacked = [...pools].filter(([, x]) => x === 0).map(([id]) => id).sort()
      expect([...bet.refund_outcomes].sort()).toEqual(unbacked)
    }
    expect(bets!.filter((b) => b.market_id === m.resolved.marketId).every((b) => !b.converted && b.shares === null)).toBe(true)
    // Every outcome nobody backed was noticed, the seeded multi's D included.
    expect(bets!.find((b) => b.market_id === m.multi.marketId)!.refund_outcomes).toEqual([m.multi.outcomeIds[3]])
    expect(bets!.find((b) => b.market_id === m.gap.marketId)!.refund_outcomes).toEqual([m.gap.outcomeIds[2]])

    // The chance each outcome shows, as the market page reads it, within the 0.1% floor.
    for (const name of CONVERTED) {
      const market = (await getMarket(client(bob), m[name].marketId))!
      for (const o of marketOdds(market)) {
        const was = before.chances.get(o.outcomeId)!
        expect(Math.abs(o.impliedProbability! - was), `${name} ${o.label}`).toBeLessThan(0.002)
        expect(Math.round(o.impliedProbability! * 100), `${name} ${o.label}`).toBe(Math.round(was * 100))
      }
    }

    // No coin moved.
    const { data: profiles } = await db.from('profiles').select('id, balance')
    for (const r of profiles!) expect(r.balance).toBe(before.balances.get(r.id))
    const { count } = await db.from('coin_transactions').select('id', { count: 'exact', head: true })
    expect(count).toBe(before.transactions)

    // Every pending parlay now stores what 0074 would pay at today's odds, with its legs locked.
    const { data: parlays } = await db
      .from('parlays')
      .select('id, status, stake, multiplier, payout, converted, max_multiplier, parlay_legs(market_id, outcome_id, locked_odds, factor, shares)')
      .eq('status', 'pending')
    expect(parlays).toHaveLength(7)
    const states = await marketStates()
    for (const row of parlays!) {
      const was = before.parlays.get(row.id)!
      const counted = was.legs.filter((l) => states(l.marketId).status !== 'voided')
      const expected = potentialPayout(was.stake, counted.map((l) => lockedOddsToBp(l.odds)), was.maxMultiplier)
      expect(row.converted).toBe(true)
      expect(row.payout).toBe(expected)
      expect(Number(row.multiplier)).toBeCloseTo(Math.min(counted.reduce((x, l) => x * l.odds, 1), was.maxMultiplier), 10)
      for (const leg of row.parlay_legs) {
        const old = was.legs.find((l) => l.outcomeId === leg.outcome_id)!
        expect(leg.shares).toBeNull()
        if (states(leg.market_id).status === 'voided') continue
        expect(Number(leg.locked_odds)).toBe(old.odds)
        expect(Number(leg.factor)).toBe(old.odds)
      }
    }
    expect(parlays!.find((r) => r.id === p.p6)!.payout).toBe(1000)
    expect(Number(parlays!.find((r) => r.id === p.p6)!.multiplier)).toBe(20)
    expect(parlays!.find((r) => r.id === p.p7)!.payout).toBe(800)

    // The pages read the same figures: Bob's Pays on the binary market, Erin's capped parlay.
    const market = (await getMarket(client(bob), m.bin.marketId))!
    const position = await getMarketPosition(client(bob), market, await getPositionKeys(client(bob), m.bin.marketId), Date.now())
    expect(position.bets.map((b) => b.paysIfWins)).toEqual([poolPayout(30, 100, 110)])
    const detail = (await getParlayDetail(client(erin), p.p6))!
    expect(detail).toMatchObject({ fixed: true, estimated: false, capped: true, potentialPayout: 1000, multiplierBp: 200_000 })

    // Charts and sparklines draw the same history.
    const { data: series } = await client(alice).rpc('market_sparklines', { p_market_ids: CONVERTED.map((n) => m[n].marketId), p_points: 200 })
    for (const s of series ?? []) expect(s.points).toEqual(before.sparklines.get(s.market_id))
  })

  it('pays every possible resolution of every market exactly what the pool rules would have', async () => {
    const before = await record()
    await convert()
    for (const name of CONVERTED) {
      for (const winner of m[name].outcomeIds) {
        await resolve(m[name], m[name].outcomeIds.indexOf(winner))
        const paid = await paidBy(m[name].marketId)
        const expected = new Map<string, number>()
        for (const bet of before.bets.filter((b) => b.marketId === m[name].marketId)) {
          expected.set(bet.profileId, (expected.get(bet.profileId) ?? 0) + poolRulePays(before, bet, winner))
        }
        for (const [id, amount] of expected) expect(paid.get(id) ?? 0, `${name} resolved to ${winner}`).toBe(amount)
        for (const [id, amount] of paid) expect(amount, `${name} paid ${id}`).toBe(expected.get(id) ?? 0)
      }
    }
  }, 90_000)

  it.each([
    ['p1 and p2 win', { bin: 0, multi: 1, closed: 1, ou: 0 }],
    ['p3 and p5 win', { bin: 0, multi: 0, closed: 0, ou: 1 }],
    ['p4 and p6 win, p6 at both caps', { bin: 1, multi: 2 }],
    ['a voided leg drops out of p4 and p6', { bin: 'void', multi: 2 }],
    ['every other leg of p4 voided too', { bin: 'void', multi: 'void', closed: 0, ou: 0 }],
    ['a voided leg drops out of p7, which stays capped', { gap: 'void', bin: 1, closed: 0 }],
  ] as [string, Partial<Record<Name, number | 'void'>>][])('settles every converted parlay as the pool rules would: %s', async (_, plan) => {
    const before = await record()
    await convert()
    for (const [name, result] of Object.entries(plan) as [Name, number | 'void'][]) {
      if (result === 'void') await voidMarket(m[name])
      else await resolve(m[name], result)
    }
    const states = await marketStates()
    const { data: parlays } = await serviceClient().from('parlays').select('id, status, credited').in('id', Object.values(p))
    for (const row of parlays!) {
      expect({ status: row.status, credited: row.credited }, row.id).toEqual(poolRuleParlay(before.parlays.get(row.id)!, states))
    }
    // Uncapped, p7's two legs left would pay 1,000.
    if (plan.gap === 'void') expect(parlays!.find((r) => r.id === p.p7)).toMatchObject({ status: 'won', credited: 800 })
    if (plan.bin === 'void') {
      const detail = (await getParlayDetail(client(erin), p.p6))!
      expect(detail.potentialPayout).toBe(poolRuleParlay(before.parlays.get(p.p6)!, states).credited)
    }
  }, 60_000)

  it('refunds a converted bet when an outcome nobody had backed wins, and pays later bets as usual', async () => {
    const before = await record()
    await convert()
    const daveShares = await lmsrSolo(dave, m.gap, 2, 10)
    const erinShares = await lmsrSolo(erin, m.gap, 0, 10)

    const gapBets = before.bets.filter((b) => b.marketId === m.gap.marketId)
    const poolRules = (winner: string) => {
      const expected = new Map<string, number>()
      for (const bet of gapBets) expected.set(bet.profileId, (expected.get(bet.profileId) ?? 0) + poolRulePays(before, bet, winner))
      return expected
    }

    await resolve(m.gap, 2)
    let paid = await paidBy(m.gap.marketId)
    const refunds = poolRules(m.gap.outcomeIds[2])
    expect(refunds.get(bob.id)).toBe(20)
    expect(refunds.get(carol.id)).toBe(30)
    expect(paid).toEqual(new Map([...refunds, [dave.id, Math.floor(daveShares)]]))
    const market = (await getMarket(client(bob), m.gap.marketId))!
    const position = await getMarketPosition(client(bob), market, await getPositionKeys(client(bob), m.gap.marketId), Date.now())
    expect(position.bets.map((b) => b.result)).toEqual([{ kind: 'refunded', reason: 'no_winners' }])
    const { data: stats } = await client(bob).rpc('member_stats', { p_profile_id: bob.id })
    // Bob's bet on the resolved pool market lost; the converted refund isn't counted as a loss.
    expect(stats![0]).toMatchObject({ bets_refunded: 1, bets_lost: 1, bets_won: 0 })

    // An override reverses the refunds and pays as the pool rules would for Yes; Dave's later bet loses.
    await resolve(m.gap, 0)
    paid = await paidBy(m.gap.marketId)
    const yes = new Map([...poolRules(m.gap.outcomeIds[0])].filter(([, amount]) => amount > 0))
    expect(paid).toEqual(new Map([...yes, [erin.id, Math.floor(erinShares)]]))
  })
})

describe('the cutover', () => {
  it('prices bets on a converted market by the market maker', async () => {
    await convert()
    const shares = await lmsrSolo(carol, m.bin, 1, 10)
    expect(shares).toBeGreaterThan(10)
    const market = (await getMarket(client(bob), m.bin.marketId))!
    const { data: series } = await client(alice).rpc('market_sparklines', { p_market_ids: [m.bin.marketId], p_points: 200 })
    const last = (series![0].points as { shares: Record<string, number> }[]).at(-1)!
    for (const o of marketOdds(market)) expect(last.shares[o.outcomeId]).toBeCloseTo(o.impliedProbability!, 9)
  })

  it('is safe to run again: nothing left to convert', async () => {
    await convert()
    expect(await convert()).toEqual({ markets: 0, bets: 0, parlays: 0 })
  })

  it('refuses a pool that doesn’t equal its live bets rather than convert it', async () => {
    await pgQuery(`update public.market_outcomes set pool_total = pool_total + 1 where id = '${m.bin.outcomeIds[0]}'`)
    await expect(convert()).rejects.toThrow(/has a pool that doesn't equal its live bets/)
    await pgQuery(`update public.market_outcomes set pool_total = pool_total - 1 where id = '${m.bin.outcomeIds[0]}'`)
    const { data } = await serviceClient().from('markets').select('pricing').eq('id', m.multi.marketId).single()
    expect(data!.pricing).toBe('pool')
  })
})
