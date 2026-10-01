import { describe, it, expect, beforeEach } from 'vitest'
import { seedMembers, clientFor, createTestMarket, ensureInvited, giveRole, backLeg, backers, makeMember, anonClient, type Member, type TestMarket } from './fixtures'
import { setBalanceViaLedger, serviceClient, type TestClient } from './helpers'
import { getMarket } from '@/lib/markets/get-market'
import { getMarketPosition, getPositionKeys } from '@/lib/markets/position'
import { getParlayRiding } from '@/lib/markets/parlay-riding'
import { poolPayout } from '@/lib/markets/odds'

let bob: Member
let carol: Member
let aliceClient: TestClient
let bobClient: TestClient
let carolClient: TestClient

beforeEach(async () => {
  const [alice, seededBob] = await seedMembers()
  bob = seededBob
  carol = await makeMember('Carol')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  await ensureInvited(bobClient)
  await ensureInvited(carolClient)
  await giveRole(alice, 'admin')
  for (const id of [bob.id, carol.id]) await setBalanceViaLedger(id, 500)
  for (const { id } of await backers()) await setBalanceViaLedger(id, 1000)
})

// Alice's market, with the 50 DC from 2 other members a parlay leg needs on both outcomes.
async function backedMarket(title: string): Promise<TestMarket> {
  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  await backLeg(market, 0)
  await backLeg(market, 1)
  return market
}

async function bet(client: TestClient, market: TestMarket, index: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[index], p_amount: amount })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('bets')
    .select('id')
    .eq('outcome_id', market.outcomeIds[index])
    .eq('amount', amount)
    .order('id', { ascending: false })
    .limit(1)
    .single()
  if (readErr) throw readErr
  return data.id
}

async function parlay(client: TestClient, outcomeIds: string[], stake: number): Promise<string> {
  const { data, error } = await client.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
  return data as string
}

async function resolve(market: TestMarket, index: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_note: 'Resolved in a test',
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[index],
  })
  if (error) throw error
}

describe('my_market_position', () => {
  it('names only the caller’s own bets and parlays on this market, oldest first', async () => {
    const m = await backedMarket('Here')
    const other = await backedMarket('Elsewhere')

    const first = await bet(bobClient, m, 0, 20)
    const second = await bet(bobClient, m, 1, 10)
    const bobParlay = await parlay(bobClient, [m.outcomeIds[0], other.outcomeIds[0]], 5)
    await bet(bobClient, other, 0, 7)
    await bet(carolClient, m, 0, 9)
    await parlay(carolClient, [m.outcomeIds[1], other.outcomeIds[1]], 6)

    expect(await getPositionKeys(bobClient, m.marketId)).toEqual({ betIds: [first, second], parlayIds: [bobParlay] })
    expect((await getPositionKeys(carolClient, m.marketId)).betIds).toHaveLength(1)
  })

  it('keeps a settled parlay and a settled bet', async () => {
    const m = await backedMarket('Here')
    const other = await backedMarket('Elsewhere')
    const id = await bet(bobClient, m, 0, 20)
    const p = await parlay(bobClient, [m.outcomeIds[0], other.outcomeIds[0]], 5)
    await resolve(other, 1)
    await resolve(m, 0)

    expect(await getPositionKeys(bobClient, m.marketId)).toEqual({ betIds: [id], parlayIds: [p] })
  })

  it('names nothing for a signed-out caller', async () => {
    const m = await backedMarket('Here')
    await bet(bobClient, m, 0, 20)
    const { data, error } = await anonClient().rpc('my_market_position', { p_market_id: m.marketId })
    expect(data ?? []).toEqual([])
    if (error) expect(error.code).toBe('42501')
  })
})

describe('getMarketPosition', () => {
  it('prices each open bet from the real pool, and shows a parlay leg here', async () => {
    const m = await backedMarket('Here')
    const other = await backedMarket('Elsewhere')
    await bet(bobClient, m, 0, 20)
    await bet(bobClient, m, 1, 10)
    const p = await parlay(bobClient, [m.outcomeIds[0], other.outcomeIds[0]], 5)

    const market = (await getMarket(bobClient, m.marketId))!
    const position = await getMarketPosition(bobClient, market, await getPositionKeys(bobClient, m.marketId), Date.now())

    // Each outcome has 50 DC from the backers, plus Bob's 20 on Yes and 10 on No: 130 in all.
    expect(position.bets.map((b) => [b.amount, b.outcomeLabel, b.result.kind, b.paysIfWins])).toEqual([
      [20, 'Yes', 'open', poolPayout(20, 70, 130)],
      [10, 'No', 'open', poolPayout(10, 60, 130)],
    ])
    expect(position.legs).toHaveLength(1)
    expect(position.legs[0].parlay.id).toBe(p)
    expect(position.legs[0].leg).toMatchObject({ marketId: m.marketId, outcomeLabel: 'Yes', status: 'open' })
  })

  it('gives each bet its result and the leg its status once the market resolves', async () => {
    const m = await backedMarket('Here')
    const other = await backedMarket('Elsewhere')
    await bet(bobClient, m, 0, 20)
    await bet(bobClient, m, 1, 10)
    await parlay(bobClient, [m.outcomeIds[0], other.outcomeIds[0]], 5)
    await resolve(m, 0)

    const market = (await getMarket(bobClient, m.marketId))!
    const position = await getMarketPosition(bobClient, market, await getPositionKeys(bobClient, m.marketId), Date.now())
    expect(position.bets.map((b) => b.result)).toEqual([{ kind: 'won', payout: poolPayout(20, 70, 130) }, { kind: 'lost' }])
    expect(position.bets.every((b) => b.paysIfWins === null)).toBe(true)
    expect(position.legs[0].leg.status).toBe('won')
    expect(position.legs[0].parlay.status).toBe('pending')
  })

  it('leaves out a bet cancelled after its key was read', async () => {
    const m = await backedMarket('Here')
    const id = await bet(bobClient, m, 0, 20)
    const keys = await getPositionKeys(bobClient, m.marketId)
    const { error } = await bobClient.rpc('cancel_bet', { p_bet_id: id })
    expect(error).toBeNull()

    const market = (await getMarket(bobClient, m.marketId))!
    expect((await getMarketPosition(bobClient, market, keys, Date.now())).bets).toEqual([])
  })
})

describe('market_parlay_riding', () => {
  it('counts each pending parlay’s whole stake on every outcome it rides on, from every member', async () => {
    const m = await backedMarket('Here')
    const a = await backedMarket('A')
    const b = await backedMarket('B')
    await parlay(bobClient, [m.outcomeIds[0], a.outcomeIds[0], b.outcomeIds[0]], 30)
    await parlay(carolClient, [m.outcomeIds[0], a.outcomeIds[1]], 15)
    await parlay(carolClient, [m.outcomeIds[1], b.outcomeIds[1]], 15)

    const riding = await getParlayRiding(bobClient, m.marketId)
    expect(Object.fromEntries(riding)).toEqual({ [m.outcomeIds[0]]: 45, [m.outcomeIds[1]]: 15 })
    // Each parlay counts in full on each of its markets, not split across its legs.
    expect(Object.fromEntries(await getParlayRiding(bobClient, a.marketId))).toEqual({ [a.outcomeIds[0]]: 30, [a.outcomeIds[1]]: 15 })
  })

  it('drops a parlay once it settles', async () => {
    const m = await backedMarket('Here')
    const a = await backedMarket('A')
    await parlay(bobClient, [m.outcomeIds[0], a.outcomeIds[0]], 30)
    await parlay(carolClient, [m.outcomeIds[0], a.outcomeIds[1]], 15)
    await resolve(a, 1)

    expect(Object.fromEntries(await getParlayRiding(bobClient, m.marketId))).toEqual({ [m.outcomeIds[0]]: 15 })
  })

  it('returns sums per outcome only, never which parlays or whose', async () => {
    const m = await backedMarket('Here')
    const a = await backedMarket('A')
    await parlay(bobClient, [m.outcomeIds[0], a.outcomeIds[0]], 30)

    const { data, error } = await carolClient.rpc('market_parlay_riding', { p_market_id: m.marketId })
    expect(error).toBeNull()
    expect(data).toEqual([{ outcome_id: m.outcomeIds[0], riding: 30 }])
    for (const row of data ?? []) expect(Object.keys(row).sort()).toEqual(['outcome_id', 'riding'])
  })

  it('never moves the pool the odds come from', async () => {
    const m = await backedMarket('Here')
    const a = await backedMarket('A')
    const before = (await getMarket(bobClient, m.marketId))!.outcomes.map((o) => o.poolTotal)
    await parlay(bobClient, [m.outcomeIds[0], a.outcomeIds[0]], 30)
    expect((await getMarket(bobClient, m.marketId))!.outcomes.map((o) => o.poolTotal)).toEqual(before)
  })

  it('shows nothing to a signed-out caller', async () => {
    const m = await backedMarket('Here')
    const a = await backedMarket('A')
    await parlay(bobClient, [m.outcomeIds[0], a.outcomeIds[0]], 30)
    const { data, error } = await anonClient().rpc('market_parlay_riding', { p_market_id: m.marketId })
    expect(data ?? []).toEqual([])
    if (error) expect(error.code).toBe('42501')
  })
})
