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
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
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
  it('is empty and unplaceable for an empty slip', async () => {
    expect(await getSlipView(bobClient, [])).toEqual({ picks: [], multiplier: 1, capped: false, canPlace: false })
  })

  it('shows live odds and a combined multiplier for open picks', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')

    const view = await getSlipView(bobClient, [a.outcomeIds[0], b.outcomeIds[0]])
    expect(view.picks).toEqual([
      { outcomeId: a.outcomeIds[0], outcomeLabel: 'Yes', marketId: a.marketId, marketTitle: 'Market A', odds: 4, available: true },
      { outcomeId: b.outcomeIds[0], outcomeLabel: 'Yes', marketId: b.marketId, marketTitle: 'Market B', odds: 4, available: true },
    ])
    expect(view.multiplier).toBe(16)
    expect(view.capped).toBe(false)
    expect(view.canPlace).toBe(true)
  })

  it('cannot place a single pick', async () => {
    const a = await seededMarket('Market A')
    expect((await getSlipView(bobClient, [a.outcomeIds[0]])).canPlace).toBe(false)
  })

  it('marks a voided market no longer available and blocks placing', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const { error } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(error).toBeNull()

    const view = await getSlipView(bobClient, [a.outcomeIds[0], b.outcomeIds[0]])
    expect(view.picks.map((p) => p.available)).toEqual([true, false])
    expect(view.multiplier).toBe(4)
    expect(view.canPlace).toBe(false)
  })

  it('reports the cap', async () => {
    const a = await seededMarket('Market A')
    const b = await seededMarket('Market B')
    const c = await seededMarket('Market C')

    const view = await getSlipView(bobClient, [a.outcomeIds[0], b.outcomeIds[0], c.outcomeIds[0]])
    expect(view.multiplier).toBe(20)
    expect(view.capped).toBe(true)
  })

  it('drops an outcome id that matches nothing', async () => {
    const a = await seededMarket('Market A')
    const view = await getSlipView(bobClient, [a.outcomeIds[0], randomUUID()])
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
    expect(pending).toMatchObject({ stake: 10, status: 'pending', credited: 0, multiplier: 16, capped: false, potentialPayout: 160 })
    expect(pending.legs).toEqual(
      expect.arrayContaining([
        { marketId: a.marketId, marketTitle: 'Market A', outcomeLabel: 'Yes', lockedOdds: 4, status: 'won' },
        { marketId: b.marketId, marketTitle: 'Market B', outcomeLabel: 'Yes', lockedOdds: 4, status: 'pending' },
      ]),
    )

    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(voidErr).toBeNull()

    const [won] = await listMyParlays(bobClient, bob.id)
    expect(won).toMatchObject({ status: 'won', credited: 40, multiplier: 4 })
    expect(won.legs.find((l) => l.marketId === b.marketId)?.status).toBe('voided')
  })

  it('returns nothing for a member with no parlays', async () => {
    expect(await listMyParlays(bobClient, bob.id)).toEqual([])
  })
})
