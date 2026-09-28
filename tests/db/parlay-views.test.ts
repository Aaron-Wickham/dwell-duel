import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { getSlipView } from '@/lib/parlays/get-slip'
import { listMyParlays } from '@/lib/parlays/list-parlays'

let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  const [alice, seededBob] = await seedMembers()
  bob = seededBob
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', alice.id)
})

// Seeded 5 on Yes / 15 on No: Yes is 4x, No is 4/3x.
async function seededMarket(title: string): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  for (const [index, amount] of [
    [0, 5],
    [1, 15],
  ] as const) {
    const { error } = await aliceClient.rpc('place_bet', {
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

  it('shows each pick with its mode, pools and live odds, and multiplies only the Parlay picks', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const c = await seededMarket('Market C')

    const view = await getSlipView(bobClient, [solo(a.outcomeIds[1]), leg(b.outcomeIds[0]), leg(c.outcomeIds[0])])
    expect(view.picks).toEqual([
      { outcomeId: a.outcomeIds[1], outcomeLabel: 'No', marketId: a.marketId, marketTitle: 'Market A', parlay: false, open: true, oddsBp: 13_333, outcomePool: 15, totalPool: 20 },
      { outcomeId: b.outcomeIds[0], outcomeLabel: 'Yes', marketId: b.marketId, marketTitle: 'Market B', parlay: true, open: true, oddsBp: 40_000, outcomePool: 5, totalPool: 20 },
      { outcomeId: c.outcomeIds[0], outcomeLabel: 'Yes', marketId: c.marketId, marketTitle: 'Market C', parlay: true, open: true, oddsBp: 40_000, outcomePool: 5, totalPool: 20 },
    ])
    expect(view.legBps).toEqual([40_000, 40_000])
    expect(view.multiplierBp).toBe(160_000)
    expect(view.capped).toBe(false)
  })

  it('has no odds for an outcome nobody has bet on, and marks a voided market not open', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Fresh' })
    const b = await seededMarket('Market B')
    const { error } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(error).toBeNull()

    const view = await getSlipView(bobClient, [solo(a.outcomeIds[0]), solo(b.outcomeIds[0])])
    expect(view.picks.map((p) => [p.open, p.oddsBp])).toEqual([
      [true, null],
      [false, 40_000],
    ])
  })

  it('reports the cap', async () => {
    const markets = await Promise.all(['A', 'B', 'C', 'D'].map((n) => seededMarket(`Market ${n}`)))

    // 4 × 4 × 4 × 4 = 256, capped at 100.
    const view = await getSlipView(bobClient, markets.map((m) => leg(m.outcomeIds[0])))
    expect(view.multiplierBp).toBe(1_000_000)
    expect(view.capped).toBe(true)
  })

  it('drops an outcome id that matches nothing', async () => {
    const a = await seededMarket('Market A')
    const view = await getSlipView(bobClient, [solo(a.outcomeIds[0]), solo(randomUUID())])
    expect(view.picks.map((p) => p.outcomeId)).toEqual([a.outcomeIds[0]])
  })
})

describe('listMyParlays', () => {
  it("lists the member's parlays with derived leg statuses and payouts", async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const { error: placeErr } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(placeErr).toBeNull()

    const { error: resolveErr } = await aliceClient.rpc('resolve_market', {
      p_market_id: a.marketId,
      p_outcome_id: a.outcomeIds[0],
    })
    expect(resolveErr).toBeNull()

    const [pending] = await listMyParlays(bobClient, bob.id)
    expect(pending).toMatchObject({ stake: 10, status: 'pending', credited: 0, multiplierBp: 160_000, capped: false, potentialPayout: 160 })
    expect(pending.legs).toEqual(
      expect.arrayContaining([
        { marketId: a.marketId, marketTitle: 'Market A', outcomeLabel: 'Yes', lockedOddsBp: 40_000, status: 'won' },
        { marketId: b.marketId, marketTitle: 'Market B', outcomeLabel: 'Yes', lockedOddsBp: 40_000, status: 'pending' },
      ]),
    )

    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(voidErr).toBeNull()

    const [won] = await listMyParlays(bobClient, bob.id)
    expect(won).toMatchObject({ status: 'won', credited: 40, multiplierBp: 40_000 })
    expect(won.legs.find((l) => l.marketId === b.marketId)?.status).toBe('voided')
  })

  it('returns nothing for a member with no parlays', async () => {
    expect(await listMyParlays(bobClient, bob.id)).toEqual([])
  })

  it('reports a capped parlay at 100x', async () => {
    const markets = await Promise.all(['A', 'B', 'C', 'D'].map((n) => seededMarket(`Market ${n}`)))
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: markets.map((m) => m.outcomeIds[0]),
      p_stake: 10,
    })
    expect(error).toBeNull()

    const [capped] = await listMyParlays(bobClient, bob.id)
    expect(capped).toMatchObject({ status: 'pending', multiplierBp: 1_000_000, capped: true, potentialPayout: 1000 })
  })
})
