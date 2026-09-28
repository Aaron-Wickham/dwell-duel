import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let a: TestMarket
let b: TestMarket
let c: TestMarket

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
  a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'A' })
  b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'B' })
  c = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'C' })
  // Parlay legs need a pool on their outcome to lock odds against.
  for (const m of [b, c]) {
    const { error } = await aliceClient.rpc('place_bet', { p_market_id: m.marketId, p_outcome_id: m.outcomeIds[0], p_amount: 5 })
    if (error) throw error
  }
})

async function balanceOf(member: Member): Promise<number> {
  const { data } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  return data?.balance as number
}

async function countFor(member: Member) {
  const db = serviceClient()
  const [{ count: bets }, { count: parlays }] = await Promise.all([
    db.from('bets').select('*', { count: 'exact', head: true }).eq('profile_id', member.id),
    db.from('parlays').select('*', { count: 'exact', head: true }).eq('profile_id', member.id),
  ])
  return { bets, parlays }
}

describe('place_slip', () => {
  it('places solo bets and a parlay together', async () => {
    const { data: parlayId, error } = await bobClient.rpc('place_slip', {
      p_singles: [
        { outcome_id: a.outcomeIds[0], amount: 10 },
        { outcome_id: a.outcomeIds[1], amount: 4 },
      ],
      p_parlay_outcome_ids: [b.outcomeIds[0], c.outcomeIds[0]],
      p_parlay_stake: 6,
    })
    expect(error).toBeNull()
    expect(parlayId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await balanceOf(bob)).toBe(80)
    expect(await countFor(bob)).toEqual({ bets: 2, parlays: 1 })
  })

  it('places solo bets alone, including on an outcome with no pool yet, and returns no parlay', async () => {
    const { data, error } = await bobClient.rpc('place_slip', {
      p_singles: [{ outcome_id: a.outcomeIds[0], amount: 3 }],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
    expect(error).toBeNull()
    expect(data).toBeNull()
    expect(await countFor(bob)).toEqual({ bets: 1, parlays: 0 })
  })

  it('places nothing when one solo bet fails, and names that pick', async () => {
    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', c.marketId)

    const { error } = await bobClient.rpc('place_slip', {
      p_singles: [
        { outcome_id: a.outcomeIds[0], amount: 10 },
        { outcome_id: c.outcomeIds[1], amount: 5 },
      ],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
    expect(error?.message).toBe(`pick ${c.outcomeIds[1]}: market is not open for betting`)
    expect(await balanceOf(bob)).toBe(100)
    expect(await countFor(bob)).toEqual({ bets: 0, parlays: 0 })
  })

  it('places nothing when the parlay fails, and says it was the parlay', async () => {
    const { error } = await bobClient.rpc('place_slip', {
      p_singles: [{ outcome_id: a.outcomeIds[0], amount: 10 }],
      p_parlay_outcome_ids: [b.outcomeIds[0]],
      p_parlay_stake: 5,
    })
    expect(error?.message).toBe('parlay: a parlay needs 2 to 6 picks')
    expect(await balanceOf(bob)).toBe(100)
    expect(await countFor(bob)).toEqual({ bets: 0, parlays: 0 })
  })

  it('passes a balance shortfall through unprefixed, placing nothing', async () => {
    const { error } = await bobClient.rpc('place_slip', {
      p_singles: [
        { outcome_id: a.outcomeIds[0], amount: 60 },
        { outcome_id: b.outcomeIds[1], amount: 60 },
      ],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
    expect(error?.code).toBe('23514')
    expect(error?.message).toMatch(/profiles_balance_check/)
    expect(await balanceOf(bob)).toBe(100)
    expect(await countFor(bob)).toEqual({ bets: 0, parlays: 0 })
  })

  it('refuses an empty slip and an uninvited member', async () => {
    const empty = await bobClient.rpc('place_slip', { p_singles: [], p_parlay_outcome_ids: [], p_parlay_stake: 0 })
    expect(empty.error?.message).toBe('your slip is empty')

    await serviceClient().from('allowed_emails').delete().eq('email', bob.email)
    const uninvited = await bobClient.rpc('place_slip', {
      p_singles: [{ outcome_id: a.outcomeIds[0], amount: 1 }],
      p_parlay_outcome_ids: [],
      p_parlay_stake: 0,
    })
    expect(uninvited.error?.message).toBe('not invited')
  })
})
