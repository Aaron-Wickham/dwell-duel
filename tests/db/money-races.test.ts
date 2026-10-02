import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, setBalanceViaLedger } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, createTestMarket, createTestTask, ensureInvited, type Member, type TestMarket, giveRole } from './fixtures'

// #72: the money paths under concurrency. Each race fires its calls together with Promise.all; the
// market row lock (for update) must serialize them so that whichever order Postgres picks, money
// moves exactly once. Alice is an admin (she may resolve before close); Bob only bets.
let alice: Member
let bob: Member
let admin: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  await giveRole(alice, 'admin')
  admin = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [admin, bobClient]) await ensureInvited(client)
})

async function balanceOf(member: Member): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  if (error) throw error
  return data.balance as number
}

async function setBalance(member: Member, balance: number) {
  await setBalanceViaLedger(member.id, balance)
}

const bet = (client: TestClient, m: TestMarket, outcome: number, amount: number) =>
  client.rpc('place_bet', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[outcome], p_amount: amount })

const resolve = (m: TestMarket, outcome: number) =>
  admin.rpc('resolve_market', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[outcome], p_note: 'Race test' })

// What Bob ends on when the same bets are resolved once, one step at a time: the reference each
// race must land on.
async function soloReference(bets: [number, number][], winner: number): Promise<number> {
  await setBalance(bob, 100)
  const twin = await createTestMarket(admin, ['Yes', 'No'], { seed: 20, title: 'Reference' })
  for (const [outcome, amount] of bets) expect((await bet(bobClient, twin, outcome, amount)).error).toBeNull()
  expect((await resolve(twin, winner)).error).toBeNull()
  const result = await balanceOf(bob)
  await setBalance(bob, 100)
  return result
}

describe('money races (#72)', () => {
  it('a bet racing a resolve either lands before it and is paid, or is refused', async () => {
    const expectedIfPlaced = await soloReference([[0, 10]], 0)
    const market = await createTestMarket(admin, ['Yes', 'No'], { seed: 20 })

    const [placed, resolved] = await Promise.all([bet(bobClient, market, 0, 10), resolve(market, 0)])
    expect(resolved.error).toBeNull()

    const { count } = await serviceClient().from('bets').select('id', { count: 'exact', head: true }).eq('market_id', market.marketId)
    if (placed.error) {
      expect(count).toBe(0)
      expect(await balanceOf(bob)).toBe(100)
    } else {
      expect(count).toBe(1)
      expect(await balanceOf(bob)).toBe(expectedIfPlaced)
    }
  })

  it('two resolves at once pay the winners exactly once', async () => {
    const expected = await soloReference([[0, 10], [1, 5]], 0)
    const market = await createTestMarket(admin, ['Yes', 'No'], { seed: 20 })
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()
    expect((await bet(bobClient, market, 1, 5)).error).toBeNull()

    const results = await Promise.all([resolve(market, 0), resolve(market, 0)])
    // The later one is an admin override onto the same outcome: it reverses, then pays again.
    expect(results.filter((r) => r.error === null).length).toBeGreaterThanOrEqual(1)
    expect(await balanceOf(bob)).toBe(expected)

    const { data } = await serviceClient().from('markets').select('status').eq('id', market.marketId).single()
    expect(data?.status).toBe('resolved')
  })

  it('a void racing a resolve: exactly one wins, and Bob is either refunded or paid, never both', async () => {
    const paid = await soloReference([[0, 10]], 0)
    const market = await createTestMarket(admin, ['Yes', 'No'], { seed: 20 })
    expect((await bet(bobClient, market, 0, 10)).error).toBeNull()

    const [voided, resolved] = await Promise.all([
      admin.rpc('void_market', { p_market_id: market.marketId, p_reason: 'Voided in a test' }),
      resolve(market, 0),
    ])
    expect([voided.error, resolved.error].filter((e) => e === null)).toHaveLength(1)

    const { data } = await serviceClient().from('markets').select('status').eq('id', market.marketId).single()
    if (voided.error === null) {
      expect(data?.status).toBe('voided')
      expect(await balanceOf(bob)).toBe(100)
    } else {
      expect(data?.status).toBe('resolved')
      expect(await balanceOf(bob)).toBe(paid)
    }
  })

  it('two slips that together overdraw a balance: one goes through, the other places nothing', async () => {
    const a = await createTestMarket(admin, ['Yes', 'No'], { seed: 20, title: 'A' })
    const b = await createTestMarket(admin, ['Yes', 'No'], { seed: 20, title: 'B' })
    const slip = (m: TestMarket) =>
      bobClient.rpc('place_slip_v4', {
        p_singles: [{ outcome_id: m.outcomeIds[0], amount: 40 }, { outcome_id: m.outcomeIds[1], amount: 20 }],
        p_parlay_outcome_ids: [],
        p_parlay_stake: 0,
      })

    const results = await Promise.all([slip(a), slip(b)])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(await balanceOf(bob)).toBe(40)

    const { count } = await serviceClient()
      .from('bets')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', bob.id)
      .in('market_id', [a.marketId, b.marketId])
    expect(count).toBe(2)
  })

  it('two approvals of one completion at once reward it once', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 30 })
    const { data: completionId, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()

    const results = await Promise.all([
      admin.rpc('approve_task_completion', { p_completion_id: completionId! }),
      admin.rpc('approve_task_completion', { p_completion_id: completionId! }),
    ])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expectError(results.find((r) => r.error !== null)!.error, 'completion is not pending')
    expect(await balanceOf(bob)).toBe(130)
  })
})
