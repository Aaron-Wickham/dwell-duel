import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backers, insertLockedParlay } from './fixtures'
import { getSlipView } from '@/lib/parlays/get-slip'
import { listMyWagers, type WagerBucket } from '@/lib/bets/list-my-wagers'
import type { ParlayView } from '@/lib/parlays/list-parlays'
import { serviceClient, setBalanceViaLedger, type TestClient } from './helpers'

let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  const [alice, seededBob] = await seedMembers()
  bob = seededBob
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  await giveRole(alice, 'admin')
  // The backers fund every market's pool, three markets at a time here.
  for (const { id } of await backers()) await setBalanceViaLedger(id, 1000)
})

// Backer1 stakes 13 on Yes and Backer2 39 on No: Yes prices at 52 / 13 = 4x, No at 4/3x.
async function seededMarket(title: string): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  const [first, second] = await backers()
  for (const [index, amount, client] of [
    [0, 13, first.client],
    [1, 39, second.client],
  ] as const) {
    const { error } = await client.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[index],
      p_amount: amount,
    })
    if (error) throw error
  }
  return market
}

describe('getSlipView', () => {
  const solo = (outcomeId: string) => ({ outcomeId, parlay: false })
  const leg = (outcomeId: string) => ({ outcomeId, parlay: true })

  it('is empty for an empty slip', async () => {
    expect(await getSlipView(bobClient, [])).toEqual({ picks: [], legBps: [], multiplierBp: 10_000, capped: false })
  })

  it('shows each pick with its mode, pools and estimated leg odds, and multiplies only the Parlay picks', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const c = await seededMarket('Market C')

    const view = await getSlipView(bobClient, [solo(a.outcomeIds[1]), leg(b.outcomeIds[0]), leg(c.outcomeIds[0])])
    const pools = { outcomePool: 13, totalPool: 52 }
    expect(view.picks).toEqual([
      {
        outcomeId: a.outcomeIds[1], outcomeLabel: 'No', marketId: a.marketId, marketTitle: 'Market A', parlay: false, open: true,
        oddsBp: 13_333, legBlock: null, outcomePool: 39, totalPool: 52,
      },
      { outcomeId: b.outcomeIds[0], outcomeLabel: 'Yes', marketId: b.marketId, marketTitle: 'Market B', parlay: true, open: true, oddsBp: 40_000, legBlock: null, ...pools },
      { outcomeId: c.outcomeIds[0], outcomeLabel: 'Yes', marketId: c.marketId, marketTitle: 'Market C', parlay: true, open: true, oddsBp: 40_000, legBlock: null, ...pools },
    ])
    expect(view.legBps).toEqual([40_000, 40_000])
    expect(view.multiplierBp).toBe(160_000)
    expect(view.capped).toBe(false)
  })

  it('marks a market under the floor, a market of your own, and a voided market', async () => {
    const fresh = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Fresh' })
    const own = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Own' })
    const b = await seededMarket('Market B')
    const { error } = await aliceClient.rpc('void_market', { p_market_id: b.marketId, p_reason: 'Voided in a test' })
    expect(error).toBeNull()

    const view = await getSlipView(bobClient, [leg(fresh.outcomeIds[0]), leg(own.outcomeIds[0]), solo(b.outcomeIds[0])])
    expect(view.picks.map((p) => [p.open, p.legBlock])).toEqual([
      [true, 'floor'],
      [true, 'own_market'],
      [false, null],
    ])
  })

  it('reports the cap', async () => {
    const markets = await Promise.all(['A', 'B', 'C'].map((n) => seededMarket(`Market ${n}`)))

    // 4 × 4 × 4 = 64, capped at 20.
    const view = await getSlipView(bobClient, markets.map((m) => leg(m.outcomeIds[0])))
    expect(view.multiplierBp).toBe(200_000)
    expect(view.capped).toBe(true)
  })

  it('drops an outcome id that matches nothing', async () => {
    const a = await seededMarket('Market A')
    const view = await getSlipView(bobClient, [solo(a.outcomeIds[0]), solo(randomUUID())])
    expect(view.picks.map((p) => p.outcomeId)).toEqual([a.outcomeIds[0]])
  })
})

// Bob's parlays on one My bets tab, through the same reader the page uses.
async function myParlays(bucket: WagerBucket): Promise<ParlayView[]> {
  const page = await listMyWagers(bobClient, bob.id, bucket, { top: null, bottom: null })
  return page.rows.flatMap((w) => (w.kind === 'parlay' ? [w.parlay] : []))
}

describe('parlays on My bets', () => {
  it("lists the member's parlays with derived leg statuses, estimates until close, and payouts", async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const { error: placeErr } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(placeErr).toBeNull()

    const [open] = await myParlays('open')
    expect(open).toMatchObject({ status: 'pending', multiplierBp: 160_000, estimated: true, potentialPayout: 160, maxMultiplier: 20 })

    const { error: resolveErr } = await aliceClient.rpc('resolve_market', {
      p_note: 'Resolved in a test',
      p_market_id: a.marketId,
      p_outcome_id: a.outcomeIds[0],
    })
    expect(resolveErr).toBeNull()

    const [pending] = await myParlays('open')
    expect(pending).toMatchObject({ stake: 10, status: 'pending', credited: 0, multiplierBp: 160_000, capped: false, estimated: true, potentialPayout: 160 })
    expect(pending.legs).toEqual(
      expect.arrayContaining([
        { marketId: a.marketId, marketTitle: 'Market A', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: true, status: 'won' },
        { marketId: b.marketId, marketTitle: 'Market B', outcomeLabel: 'Yes', oddsBp: 40_000, oddsKnown: false, status: 'open' },
      ]),
    )

    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId, p_reason: 'Voided in a test' })
    expect(voidErr).toBeNull()

    expect(await myParlays('open')).toEqual([])
    const [won] = await myParlays('settled')
    expect(won).toMatchObject({ status: 'won', credited: 40, multiplierBp: 40_000, estimated: false })
    expect(won.legs.find((l) => l.marketId === b.marketId)?.status).toBe('voided')
  })

  it('knows a leg’s odds once its market has closed, before it resolves', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[1]], p_stake: 10 })
    expect(error).toBeNull()
    for (const m of [a, b]) {
      const { error: closeErr } = await serviceClient().from('markets').update({ close_at: new Date(Date.now() - 1000).toISOString() }).eq('id', m.marketId)
      expect(closeErr).toBeNull()
    }
    const [pending] = await myParlays('open')
    expect(pending.legs.map((l) => [l.oddsBp, l.oddsKnown])).toEqual(expect.arrayContaining([[40_000, true], [13_333, true]]))
    expect(pending).toMatchObject({ estimated: false, multiplierBp: 53_332, potentialPayout: 53 })
  })

  it('returns nothing for a member with no parlays', async () => {
    expect(await myParlays('open')).toEqual([])
    expect(await myParlays('settled')).toEqual([])
  })

  it('reports a capped parlay at 20x, and at 1,000 DC', async () => {
    const markets = await Promise.all(['A', 'B', 'C'].map((n) => seededMarket(`Market ${n}`)))
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: markets.map((m) => m.outcomeIds[0]),
      p_stake: 60,
    })
    expect(error).toBeNull()

    const [capped] = await myParlays('open')
    expect(capped).toMatchObject({ status: 'pending', multiplierBp: 200_000, capped: true, potentialPayout: 1000 })
  })

  it('shows a parlay placed before 0074 at its locked odds, under the 20x cap', async () => {
    const markets = await Promise.all(['A', 'B', 'C'].map((n) => seededMarket(`Market ${n}`)))
    await insertLockedParlay(bob.id, 10, markets.map((market) => ({ market, outcomeIndex: 0, lockedOdds: 4 })))

    const [locked] = await myParlays('open')
    expect(locked).toMatchObject({ maxMultiplier: 20, lockedAtPlacement: true, multiplierBp: 200_000, capped: true, estimated: false, potentialPayout: 200 })
  })
})
