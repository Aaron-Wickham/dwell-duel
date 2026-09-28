import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'

// #61: a repeat of an attempt key returns the first call's result instead of acting again.
let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let a: TestMarket
let b: TestMarket

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
  a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'A', seed: 20 })
  b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'B', seed: 20 })
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

describe('place_slip with an attempt key', () => {
  it('places once when the same key is sent twice, and returns the same parlay id', async () => {
    const key = randomUUID()
    const first = await bobClient.rpc('place_slip', slip(key))
    expect(first.error).toBeNull()
    const second = await bobClient.rpc('place_slip', slip(key))
    expect(second.error).toBeNull()
    expect(second.data).toBe(first.data)
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
    expect(await balanceOf(bob)).toBe(84)
  })

  it('places once when two calls with the same key race', async () => {
    const key = randomUUID()
    const [one, two] = await Promise.all([bobClient.rpc('place_slip', slip(key)), bobClient.rpc('place_slip', slip(key))])
    expect(one.error).toBeNull()
    expect(two.error).toBeNull()
    expect(two.data).toBe(one.data)
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
  })

  it('places again with a new key, or with no key', async () => {
    for (const key of [randomUUID(), randomUUID(), undefined]) {
      const { error } = await bobClient.rpc('place_slip', slip(key, 1))
      expect(error).toBeNull()
    }
    expect(await countFor(bob)).toEqual({ bets: 3, parlays: 3 })
  })

  it('does not use up the key when the place fails, so the retry goes through', async () => {
    const key = randomUUID()
    const tooMuch = await bobClient.rpc('place_slip', slip(key, 1000))
    expect(tooMuch.error).not.toBeNull()
    expect(await countFor(bob)).toEqual({ bets: 0, parlays: 0 })

    const retry = await bobClient.rpc('place_slip', slip(key))
    expect(retry.error).toBeNull()
    expect(retry.data).toMatch(/^[0-9a-f-]{36}$/)
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 1 })
  })

  it("refuses another member's key", async () => {
    const key = randomUUID()
    expect((await bobClient.rpc('place_slip', slip(key))).error).toBeNull()
    const { error } = await aliceClient.rpc('place_slip', slip(key))
    expect(error?.message).toBe('that request key was already used')
    expect(await countFor(alice)).toEqual({ bets: 0, parlays: 0 })
  })

  it('keeps the keys out of members’ reach', async () => {
    await bobClient.rpc('place_slip', slip(randomUUID()))
    const read = await bobClient.from('idempotency_keys' as never).select('key')
    expect(read.error).not.toBeNull()
    const claim = await bobClient.rpc('claim_idempotency_key', { p_key: randomUUID(), p_action: 'place_slip' })
    expect(claim.error).not.toBeNull()
  })
})

describe('adjust_balance with an attempt key', () => {
  it('adjusts once when the same key is sent twice', async () => {
    await serviceClient().from('profiles').update({ role: 'owner' }).eq('id', alice.id)
    const owner = await clientFor(alice)
    const key = randomUUID()
    const args = { p_profile_id: bob.id, p_amount: 25, p_reason: 'Prize', p_idempotency_key: key }
    expect((await owner.rpc('adjust_balance', args)).error).toBeNull()
    expect((await owner.rpc('adjust_balance', args)).error).toBeNull()
    expect(await balanceOf(bob)).toBe(125)
  })
})
