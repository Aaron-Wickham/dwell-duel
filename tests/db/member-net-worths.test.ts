import { describe, it, expect, beforeEach } from 'vitest'
import { type TestClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, makeMember, clientFor, ensureInvited, giveRole, anonClient, createTestMarket, type Member, type TestMarket } from './fixtures'
import { readNetWorths } from '@/lib/members/net-worth'

// 0111 (#418): member_net_worths gives the net worth the board and member_standing give, for
// current and removed members alike, in one read.
let owner: Member
let bob: Member
let carol: Member
let dave: Member
let ownerClient: TestClient
let bobClient: TestClient
let carolClient: TestClient

beforeEach(async () => {
  ;[owner, bob] = await seedMembers()
  carol = await makeMember('Carol')
  dave = await makeMember('Dave')
  await giveRole(owner, 'owner')
  ownerClient = await clientFor(owner)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  for (const c of [ownerClient, bobClient, carolClient, await clientFor(dave)]) await ensureInvited(c)
})

// A shown payout of 1 DC is never more than 2% above what the slip pays, so it's never refused.
async function solo(client: TestClient, market: TestMarket, outcome: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_slip_v4', {
    p_singles: [{ outcome_id: market.outcomeIds[outcome], amount, payout: 1 }],
    p_parlay_outcome_ids: [],
    p_parlay_stake: 0,
  })
  if (error) throw error
}

async function parlay(client: TestClient, legs: [TestMarket, number][], stake: number): Promise<void> {
  const { error } = await client.rpc('place_slip_v4', {
    p_singles: [],
    p_parlay_outcome_ids: legs.map(([m, i]) => m.outcomeIds[i]),
    p_parlay_stake: stake,
    p_parlay_payout: 1,
  })
  if (error) throw error
}

async function remove(m: Member): Promise<void> {
  const { error } = await ownerClient.rpc('remove_member', { p_profile_id: m.id })
  if (error) throw error
}

async function setWorths(client: TestClient, ids: string[]): Promise<Map<string, number>> {
  const { data, error } = await client.rpc('member_net_worths', { p_ids: ids })
  if (error) throw error
  return new Map(data.map((r) => [r.id, r.score]))
}

async function boardWorths(client: TestClient): Promise<Map<string, number>> {
  const { data, error } = await client.rpc('leaderboard_net_worth').select('id, score')
  if (error) throw error
  return new Map(data.map((r) => [r.id, r.score]))
}

async function standingWorth(client: TestClient, id: string): Promise<number | undefined> {
  const { data, error } = await client.rpc('member_standing', { p_profile_id: id }).maybeSingle()
  if (error) throw error
  return data?.score
}

describe('member_net_worths', () => {
  it('equals the board and member_standing for current and removed members, open bets and parlays included', async () => {
    const [m1, m2, m3] = await Promise.all(
      [1, 2, 3].map((n) => createTestMarket(ownerClient, ['Yes', 'No'], { lmsr: true, title: `Market ${n}` })),
    )
    // Bob has a solo bet and a parlay riding; Carol a parlay, then she's removed; Dave a solo bet,
    // on a market that then resolves, so it stops riding.
    await solo(bobClient, m1, 0, 30)
    await parlay(bobClient, [[m1, 1], [m2, 0]], 12)
    await parlay(carolClient, [[m2, 1], [m3, 0]], 20)
    await solo(carolClient, m3, 1, 7)
    await solo(await clientFor(dave), m3, 0, 15)
    await remove(carol)

    const ids = [owner.id, bob.id, carol.id, dave.id]
    const worths = await setWorths(ownerClient, ids)
    const board = await boardWorths(ownerClient)

    expect(board.has(carol.id)).toBe(false)
    for (const id of [owner.id, bob.id, dave.id]) expect(worths.get(id), id).toBe(board.get(id))
    for (const id of ids) expect(worths.get(id), id).toBe(await standingWorth(ownerClient, id))
    // Riding stakes count at what was staked: nobody has won or lost anything yet.
    expect(worths).toEqual(new Map(ids.map((id) => [id, 100])))

    // Dave's market resolves against him: his stake is gone and stops riding.
    const { error } = await ownerClient.rpc('resolve_market', { p_note: 'Resolved in a test', p_market_id: m3.marketId, p_outcome_id: m3.outcomeIds[1] })
    if (error) throw error
    const after = await setWorths(ownerClient, ids)
    for (const id of ids) expect(after.get(id), id).toBe(await standingWorth(ownerClient, id))
    expect(after.get(dave.id)).toBe(85)

    // What Admin › Members reads, through the app's helper.
    expect(await readNetWorths(ownerClient, ids)).toEqual(after)
  })

  it('leaves out an id with no profile, and reads nothing for no ids', async () => {
    const worths = await setWorths(bobClient, [bob.id, '00000000-0000-4000-8000-000000000000'])
    expect([...worths.keys()]).toEqual([bob.id])
    expect((await setWorths(bobClient, [])).size).toBe(0)
  })

  it('takes at most 50 ids a call', async () => {
    const fifty = [bob.id, ...Array.from({ length: 49 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)]
    expect((await setWorths(bobClient, fifty)).get(bob.id)).toBe(100)
    const { error } = await bobClient.rpc('member_net_worths', { p_ids: [...fifty, owner.id] })
    expectError(error, 'too many members in one read')
  })

  it('refuses a signed-out caller', async () => {
    const { error } = await anonClient().rpc('member_net_worths', { p_ids: [bob.id] })
    expectError(error, { code: '42501', message: 'permission denied for function member_net_worths' })
  })
})
