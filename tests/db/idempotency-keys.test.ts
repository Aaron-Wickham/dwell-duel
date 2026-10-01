import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { serviceClient, type TestClient, type SlipSummary } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket, giveRole, backLeg } from './fixtures'

// #61: a repeat of an attempt key returns the first call's result instead of acting again.
let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient
let a: TestMarket
let b: TestMarket

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
  a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'A', seed: 20 })
  b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'B', seed: 20 })
  // The parlay floor (0074) for both of the slip's parlay legs.
  await backLeg(a, 0)
  await backLeg(b, 1)
})

async function balanceOf(member: Member): Promise<number> {
  const { data } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  return data?.balance as number
}

async function countFor(member: Member) {
  const db = serviceClient()
  const [{ count: bets }, { count: parlays }] = await Promise.all([
    db.from('bets').select('id', { count: 'exact', head: true }).eq('profile_id', member.id),
    db.from('parlays').select('id', { count: 'exact', head: true }).eq('profile_id', member.id),
  ])
  return { bets, parlays }
}

const slip = (key: string | undefined, stake = 6) => ({
  p_singles: [{ outcome_id: a.outcomeIds[0], amount: 10 }],
  p_parlay_outcome_ids: [a.outcomeIds[1], b.outcomeIds[0]],
  p_parlay_stake: stake,
  p_idempotency_key: key,
})

// #226: v2 says what was placed and whether the call was a replay, so a retry after a lost response
// reports the earlier attempt instead of whatever the slip holds now.
describe('place_slip_v2', () => {
  it('returns what it placed, and the same summary marked as a replay on a repeat of the key', async () => {
    const key = randomUUID()
    const first = await bobClient.rpc('place_slip_v2', slip(key))
    expect(first.error).toBeNull()
    const placed = first.data as SlipSummary
    expect(placed.replayed).toBe(false)
    expect(placed.solos).toBe(1)
    expect([...placed.picks].sort()).toEqual([a.outcomeIds[0], a.outcomeIds[1], b.outcomeIds[0]].sort())
    expect(placed.parlay_id).toEqual(expect.any(String))

    // A different slip under the same key still replays the first one, and places nothing.
    const second = await bobClient.rpc('place_slip_v2', { ...slip(key), p_singles: [{ outcome_id: b.outcomeIds[1], amount: 3 }] })
    expect(second.error).toBeNull()
    expect(second.data).toEqual({ ...placed, replayed: true })
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
  })

  it('shares keys with place_slip, which still returns the parlay id for the build before 0072', async () => {
    const key = randomUUID()
    const old = await bobClient.rpc('place_slip', slip(key))
    expect(old.error).toBeNull()
    const replay = await bobClient.rpc('place_slip_v2', slip(key))
    expect(replay.error).toBeNull()
    expect((replay.data as SlipSummary).replayed).toBe(true)
    expect((replay.data as SlipSummary).parlay_id).toBe(old.data)
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
  })
})

describe('place_slip_v2 with an attempt key', () => {
  it('places once when the same key is sent twice, and returns the same parlay id', async () => {
    const key = randomUUID()
    const first = await bobClient.rpc('place_slip_v2', slip(key))
    expect(first.error).toBeNull()
    const second = await bobClient.rpc('place_slip_v2', slip(key))
    expect(second.error).toBeNull()
    expect(first.data).toMatchObject({ replayed: false, solos: 1 })
    expect(second.data).toEqual({ ...(first.data as SlipSummary), replayed: true })
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
    expect(await balanceOf(bob)).toBe(84)
  })

  it('places once when two calls with the same key race', async () => {
    const key = randomUUID()
    const [one, two] = await Promise.all([bobClient.rpc('place_slip_v2', slip(key)), bobClient.rpc('place_slip_v2', slip(key))])
    expect(one.error).toBeNull()
    expect(two.error).toBeNull()
    const [x, y] = [one.data as SlipSummary, two.data as SlipSummary]
    expect(x.parlay_id).toBe(y.parlay_id)
    expect([x.replayed, y.replayed].sort()).toEqual([false, true])
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
  })

  it('places again with a new key, or with no key', async () => {
    for (const key of [randomUUID(), randomUUID(), undefined]) {
      const { error } = await bobClient.rpc('place_slip_v2', slip(key, 1))
      expect(error).toBeNull()
    }
    expect(await countFor(bob)).toEqual({ bets: 3, parlays: 3 })
  })

  it('does not use up the key when the place fails, so the retry goes through', async () => {
    const key = randomUUID()
    const tooMuch = await bobClient.rpc('place_slip_v2', slip(key, 1000))
    expectError(tooMuch.error, { code: '23514', message: 'profiles_balance_check' })
    expect(await countFor(bob)).toEqual({ bets: 0, parlays: 0 })

    const retry = await bobClient.rpc('place_slip_v2', slip(key))
    expect(retry.error).toBeNull()
    expect((retry.data as SlipSummary).replayed).toBe(false)
    expect((retry.data as SlipSummary).parlay_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
  })

  it("refuses another member's key", async () => {
    const key = randomUUID()
    expect((await bobClient.rpc('place_slip_v2', slip(key))).error).toBeNull()
    const { error } = await aliceClient.rpc('place_slip_v2', slip(key))
    expect(error?.message).toBe('that request key was already used')
    expect(await countFor(alice)).toEqual({ bets: 0, parlays: 0 })
  })

  it('keeps the keys out of members’ reach', async () => {
    await bobClient.rpc('place_slip_v2', slip(randomUUID()))
    const read = await bobClient.from('idempotency_keys' as never).select('key')
    expectError(read.error, { code: '42501', message: 'permission denied for table idempotency_keys' })
    const claim = await bobClient.rpc('claim_idempotency_key', { p_key: randomUUID(), p_action: 'place_slip' })
    expectError(claim.error, { code: '42501', message: 'permission denied for function claim_idempotency_key' })
  })
})

describe('adjust_balance with an attempt key', () => {
  it('adjusts once when the same key is sent twice', async () => {
    await giveRole(alice, 'owner')
    const owner = await clientFor(alice)
    const key = randomUUID()
    const args = { p_profile_id: bob.id, p_amount: 25, p_reason: 'Prize', p_idempotency_key: key }
    expect((await owner.rpc('adjust_balance', args)).error).toBeNull()
    expect((await owner.rpc('adjust_balance', args)).error).toBeNull()
    expect(await balanceOf(bob)).toBe(125)
  })
})
