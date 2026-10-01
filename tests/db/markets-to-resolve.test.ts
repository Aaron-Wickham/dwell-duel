import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { seedMembers, makeMember, clientFor, anonClient, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole } from './fixtures'
import { getMarketsToResolve } from '@/lib/markets/markets-to-resolve'

const HOUR = 3_600_000

let alice: Member
let bob: Member
let reviewer: Member
let admin: Member
let aliceClient: TestClient
let bobClient: TestClient
let reviewerClient: TestClient
let adminClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  reviewer = await makeMember('Rhoda')
  admin = await makeMember('Ada')
  for (const [m, role] of [
    [reviewer, 'reviewer'],
    [admin, 'admin'],
  ] as const) {
    await giveRole(m, role)
  }
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  reviewerClient = await clientFor(reviewer)
  adminClient = await clientFor(admin)
  for (const c of [aliceClient, bobClient, reviewerClient, adminClient]) await ensureInvited(c)
})

async function closedAgo(marketId: string, ms: number): Promise<void> {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - ms).toISOString() })
    .eq('id', marketId)
  if (error) throw error
}

async function bet(client: TestClient, market: TestMarket): Promise<void> {
  const { error } = await client.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 5 })
  if (error) throw error
}

async function market(title: string, closedMsAgo: number | null, bettors: TestClient[] = []): Promise<TestMarket> {
  const m = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
  for (const client of bettors) await bet(client, m)
  if (closedMsAgo !== null) await closedAgo(m.marketId, closedMsAgo)
  return m
}

const titles = async (client: TestClient) => (await getMarketsToResolve(client)).markets.map((m) => m.title)

describe('markets_to_resolve', () => {
  it("nudges a creator about their own closed markets they can resolve, soonest closed first", async () => {
    await market('Still open', null)
    await market('Closed an hour ago', HOUR)
    await market('Closed a week ago', 7 * 24 * HOUR)
    await market('Creator bet on it', HOUR, [aliceClient])
    const resolved = await market('Resolved', HOUR)
    const { error } = await aliceClient.rpc('resolve_market', {
      p_note: 'Resolved in a test',
      p_market_id: resolved.marketId,
      p_outcome_id: resolved.outcomeIds[0],
    })
    if (error) throw error
    // Voided while open (after close only an admin may, 0073), then past its close like the rest.
    const voided = await market('Voided', null)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId, p_reason: 'Voided in a test' })
    if (voidErr) throw voidErr
    await closedAgo(voided.marketId, HOUR)

    expect(await getMarketsToResolve(aliceClient)).toMatchObject({
      total: 2,
      markets: [{ title: 'Closed a week ago' }, { title: 'Closed an hour ago' }],
    })
  })

  it("never nudges a member about someone else's market", async () => {
    await market('Closed a week ago', 7 * 24 * HOUR)
    await market('Creator bet on it', HOUR, [aliceClient])
    expect(await getMarketsToResolve(bobClient)).toEqual({ total: 0, markets: [] })
  })

  it('nudges a reviewer after 48 hours, or at once when the creator has a stake, never with a stake of their own', async () => {
    await market('Closed an hour ago', HOUR)
    await market('Closed 47 hours ago', 47 * HOUR)
    await market('Closed 49 hours ago', 49 * HOUR)
    await market('Creator bet on it', HOUR, [aliceClient])
    await market('Reviewer bet on it', 49 * HOUR, [reviewerClient])
    await market('Creator bet, not closed', null, [aliceClient])

    expect(await titles(reviewerClient)).toEqual(['Closed 49 hours ago', 'Creator bet on it'])
  })

  it('counts a creator parlay leg as a stake that needs someone else', async () => {
    // Seeded, so a leg has odds to lock before anyone has bet.
    const legA = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Creator parlay leg', seed: 20 })
    const legB = await createTestMarket(bobClient, ['Yes', 'No'], { title: 'Other leg', seed: 20 })
    const { error } = await aliceClient.rpc('place_parlay', { p_outcome_ids: [legA.outcomeIds[0], legB.outcomeIds[0]], p_stake: 5 })
    if (error) throw error
    await closedAgo(legA.marketId, HOUR)

    expect(await titles(reviewerClient)).toEqual(['Creator parlay leg'])
    expect(await titles(aliceClient)).toEqual([])
  })

  it('nudges an admin like a reviewer, stake or not, since an admin can always resolve', async () => {
    await market('Closed an hour ago', HOUR)
    await market('Closed 49 hours ago', 49 * HOUR, [adminClient])
    await market('Creator bet on it', HOUR, [aliceClient])

    expect(await titles(adminClient)).toEqual(['Closed 49 hours ago', 'Creator bet on it'])
  })

  it('lists the first 10 but counts them all', async () => {
    const start = Date.now() - 30 * 24 * HOUR
    const rows = Array.from({ length: 12 }, (_, i) => ({
      created_by: alice.id,
      title: `Old ${String(i).padStart(2, '0')}`,
      kind: 'binary',
      status: 'open',
      created_at: new Date(start - HOUR).toISOString(),
      close_at: new Date(start + i * HOUR).toISOString(),
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error

    for (const client of [aliceClient, adminClient]) {
      const page = await getMarketsToResolve(client)
      expect(page.total).toBe(12)
      expect(page.markets.map((m) => m.title)).toEqual(rows.slice(0, 10).map((r) => r.title))
    }
  })

  it('is empty for an uninvited session and closed to anon', async () => {
    await market('Closed a week ago', 7 * 24 * HOUR)
    const carol = await makeMember('Carol')
    expect(await getMarketsToResolve(await clientFor(carol))).toEqual({ total: 0, markets: [] })
    const { error } = await anonClient().rpc('markets_to_resolve')
    expect(error?.code).toBe('42501')
  })
})
