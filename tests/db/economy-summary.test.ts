import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient, expectError, skipLedgerCheck } from './helpers'
import {
  seedMembers,
  makeMember,
  clientFor,
  anonClient,
  ensureInvited,
  createTestMarket,
  createTestTask,
  type Member,
  type TestMarket, giveRole } from './fixtures'

// 0052 (#86): the owner's economy panel.
let alice: Member
let bob: Member
let olive: Member
let aliceClient: TestClient
let bobClient: TestClient
let oliveClient: TestClient

type Summary = {
  month_start: string
  month_end: string
  balances: number
  bets_at_stake: number
  parlays_at_stake: number
  starting_grants_added: number
  task_rewards_added: number
  seed_payouts_added: number
  seed_payouts_removed: number
  house_parlays_added: number
  house_parlays_removed: number
  owner_adjustments_added: number
  owner_adjustments_removed: number
  all_time_added: number
  all_time_removed: number
  unclassified: number
}

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  olive = await makeMember('Olive')
  await giveRole(olive, 'owner')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  oliveClient = await clientFor(olive)
  for (const client of [aliceClient, bobClient, oliveClient]) await ensureInvited(client)
})

async function summary(at: string = new Date().toISOString()): Promise<Summary> {
  const { data, error } = await oliveClient.rpc('economy_summary', { p_month_start: at }).single()
  if (error) throw error
  const row = data as Record<string, number | string>
  // bigint columns may come back as strings; the month bounds stay ISO strings.
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, k.startsWith('month_') ? v : Number(v)]),
  ) as unknown as Summary
}

async function bet(client: TestClient, market: TestMarket, outcome: number, amount: number): Promise<number> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcome],
    p_amount: amount,
  })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('bets')
    .select('id')
    .eq('market_id', market.marketId)
    .order('id', { ascending: false })
    .limit(1)
    .single()
  if (readErr) throw readErr
  return data.id as number
}

async function resolve(market: TestMarket, outcome: number): Promise<void> {
  const { error } = await oliveClient.rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcome],
    p_note: 'Resolved in a test',
  })
  if (error) throw error
}

async function parlay(outcomeIds: string[], stake: number): Promise<void> {
  const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
}

async function adjust(member: Member, amount: number): Promise<void> {
  const { error } = await oliveClient.rpc('adjust_balance', { p_profile_id: member.id, p_amount: amount, p_reason: 'Test' })
  if (error) throw error
}

async function balanceSum(): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance')
  if (error) throw error
  return data.reduce((sum, p) => sum + (p.balance as number), 0)
}

async function ledgerSum(): Promise<number> {
  const { data, error } = await serviceClient().from('coin_transactions').select('amount')
  if (error) throw error
  return data.reduce((sum, t) => sum + (t.amount as number), 0)
}

function circulation(s: Summary): number {
  return s.balances + s.bets_at_stake + s.parlays_at_stake
}

// Alice, Bob and Olive each start on 100 DC. The markets are Olive's, so as the owner (an admin)
// she resolves them before close and overrides with no stake of her own.
async function playScenario(): Promise<void> {
  // A task reward: +10 to Bob.
  const { taskId } = await createTestTask(olive, { rewardAmount: 10 })
  const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
  if (submitErr) throw submitErr
  const { error: approveErr } = await oliveClient.rpc('approve_task_completion', { p_completion_id: completionId })
  if (approveErr) throw approveErr

  // A seeded market (20 a side) resolved with a winner. Alice 30 on Yes, Bob 10 on No: Yes pays
  // Alice floor(30 x (40 + 40) / (30 + 20)) = 48 against 40 staked, so the seed adds 8.
  const m1 = await createTestMarket(oliveClient, ['Yes', 'No'], { title: 'Seeded', seed: 20 })
  await bet(aliceClient, m1, 0, 30)
  await bet(bobClient, m1, 1, 10)
  await resolve(m1, 0)

  // Two parlays on two unbet seeded markets, every leg locked at (0 + 40) / (0 + 20) = 2x.
  // Bob's Yes-Yes wins 10 x 4 = 40 (the house adds 30); his No-No loses its 5 at the first
  // resolution (the house removes 5).
  const m2 = await createTestMarket(oliveClient, ['Yes', 'No'], { title: 'Leg one', seed: 20 })
  const m3 = await createTestMarket(oliveClient, ['Yes', 'No'], { title: 'Leg two', seed: 20 })
  await parlay([m2.outcomeIds[0], m3.outcomeIds[0]], 10)
  await parlay([m2.outcomeIds[1], m3.outcomeIds[1]], 5)
  await resolve(m2, 0)
  await resolve(m3, 0)

  // Owner adjustments both ways: +25 to Alice, -5 from Bob.
  await adjust(alice, 25)
  await adjust(bob, -5)

  // Override m1 to No: Alice's 48 is taken back and Bob is paid floor(10 x 80 / 30) = 26, so
  // that event removes 22 and the market's seed nets 26 - 40 = -14 over its life.
  await resolve(m1, 1)

  // Stakes that move and come back, which create nothing: a cancelled bet and a voided market.
  const m4 = await createTestMarket(oliveClient, ['Yes', 'No'], { title: 'Voided', seed: 20 })
  await bet(aliceClient, m4, 0, 7)
  const cancelled = await bet(bobClient, m4, 1, 3)
  const { error: cancelErr } = await bobClient.rpc('cancel_bet', { p_bet_id: cancelled })
  if (cancelErr) throw cancelErr
  const { error: voidErr } = await oliveClient.rpc('void_market', { p_market_id: m4.marketId, p_reason: 'Voided in a test' })
  if (voidErr) throw voidErr

  // Still at stake: Alice's 12 on an open market and Bob's pending 4 DC parlay.
  const m5 = await createTestMarket(oliveClient, ['Yes', 'No'], { title: 'Open one', seed: 20 })
  const m6 = await createTestMarket(oliveClient, ['Yes', 'No'], { title: 'Open two', seed: 20 })
  await bet(aliceClient, m5, 0, 12)
  await parlay([m5.outcomeIds[1], m6.outcomeIds[0]], 4)
}

describe('economy_summary', () => {
  it('refuses an admin who isn’t the owner', async () => {
    const ada = await makeMember('Ada')
    await giveRole(ada, 'admin')
    const adaClient = await clientFor(ada)
    const { data, error } = await adaClient.rpc('economy_summary', { p_month_start: new Date().toISOString() })
    expect(error?.message).toBe('only the owner can see the economy')
    expect(data).toBeNull()
  })

  it('refuses a plain member', async () => {
    const { error } = await bobClient.rpc('economy_summary', { p_month_start: new Date().toISOString() })
    expect(error?.message).toBe('only the owner can see the economy')
  })

  it('is not callable signed out', async () => {
    const { error } = await anonClient().rpc('economy_summary', { p_month_start: new Date().toISOString() })
    expectError(error, { code: '42501', message: 'permission denied for function economy_summary' })
  })

  it('keeps economy_flows away from members', async () => {
    const { error } = await bobClient.rpc('economy_flows', { p_from: '-infinity', p_to: 'infinity' })
    expectError(error, { code: '42501', message: 'permission denied for function economy_flows' })
  })

  it('bounds the month midnight to midnight in America/New_York', async () => {
    // March 2026 starts in EST (UTC-5) and ends in EDT (UTC-4).
    const s = await summary('2026-03-15T12:00:00Z')
    expect(Date.parse(s.month_start)).toBe(Date.parse('2026-03-01T05:00:00Z'))
    expect(Date.parse(s.month_end)).toBe(Date.parse('2026-04-01T04:00:00Z'))
    // 03:30 UTC on 1 February is still 31 January in New York.
    const jan = await summary('2026-02-01T03:30:00Z')
    expect(Date.parse(jan.month_start)).toBe(Date.parse('2026-01-01T05:00:00Z'))
  })

  it('gives each source its figure after a scripted month', async () => {
    await playScenario()
    const s = await summary()

    expect(s.starting_grants_added).toBe(300)
    expect(s.task_rewards_added).toBe(10)
    expect(s.seed_payouts_added).toBe(8)
    expect(s.seed_payouts_removed).toBe(22)
    expect(s.house_parlays_added).toBe(30)
    expect(s.house_parlays_removed).toBe(5)
    expect(s.owner_adjustments_added).toBe(25)
    expect(s.owner_adjustments_removed).toBe(5)

    expect(s.bets_at_stake).toBe(12)
    expect(s.parlays_at_stake).toBe(4)
    // Alice 100 - 30 + 48 + 25 - 48 - 7 + 7 - 12 = 83; Bob 100 + 10 - 10 - 10 - 5 + 40 - 5 + 26
    // - 3 + 3 - 4 = 142; Olive 100.
    expect(s.balances).toBe(325)
    expect(s.unclassified).toBe(0)
  })

  it('reconciles with the ledger: everything added, less everything removed, is what circulates', async () => {
    await playScenario()
    const s = await summary()

    // The figures the RPC reads match the tables themselves.
    expect(s.balances).toBe(await balanceSum())
    expect(s.balances).toBe(await ledgerSum())

    // Starting balances are the grants, so this is grants + minted - destroyed = balances + at stake.
    expect(s.all_time_added - s.all_time_removed).toBe(circulation(s))
    expect(s.all_time_added).toBe(373)
    expect(s.all_time_removed).toBe(32)
    expect(circulation(s)).toBe(341)
  })

  it('counts each flow in the month it happened and every month in the all-time totals', async () => {
    await playScenario()
    // Move Alice's starting grant into January 2026, and Bob's to 22:30 on 31 January in New York
    // (03:30 UTC on 1 February), so both belong to January.
    const db = serviceClient()
    await db.from('coin_transactions').update({ created_at: '2026-01-15T12:00:00Z' }).eq('profile_id', alice.id).eq('type', 'starting_grant')
    await db.from('coin_transactions').update({ created_at: '2026-02-01T03:30:00Z' }).eq('profile_id', bob.id).eq('type', 'starting_grant')

    const now = await summary()
    expect(now.starting_grants_added).toBe(100)

    const january = await summary('2026-01-20T12:00:00Z')
    expect(january.starting_grants_added).toBe(200)
    expect(january.task_rewards_added).toBe(0)
    expect(january.seed_payouts_added).toBe(0)

    const february = await summary('2026-02-10T12:00:00Z')
    expect(february.starting_grants_added).toBe(0)

    expect(now.all_time_added - now.all_time_removed).toBe(circulation(now))
  })

  it('shows a ledger type it doesn’t know as unclassified, and the gap it leaves', async () => {
    const { error } = await serviceClient()
      .from('coin_transactions')
      .insert({ profile_id: bob.id, amount: 7, type: 'mystery' })
    expect(error).toBeNull()
    skipLedgerCheck('this test writes the balance without its ledger row to make the gap the panel reports')
    await serviceClient().from('profiles').update({ balance: 107 }).eq('id', bob.id)

    const s = await summary()
    expect(s.unclassified).toBe(1)
    expect(s.all_time_added - s.all_time_removed - circulation(s)).toBe(-7)
  })
})
