import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, type TestClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

interface SeededParlays {
  aliceClient: TestClient
  marketId: string
  outcomeIds: string[]
  aliceParlayId: string
}

// Rows are inserted directly with the service client: this file tests the
// tables' access rules, not place_parlay (Task 2).
async function seedParlays(): Promise<SeededParlays> {
  const aliceClient = await clientFor(alice)
  const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
  const db = serviceClient()

  const { data: parlays, error } = await db
    .from('parlays')
    .insert([
      { profile_id: alice.id, stake: 10, max_multiplier: 20 },
      { profile_id: bob.id, stake: 10, max_multiplier: 20 },
    ])
    .select('id, profile_id')
  if (error) throw error

  const { error: legsErr } = await db
    .from('parlay_legs')
    .insert(parlays!.map((p) => ({ parlay_id: p.id, market_id: marketId, outcome_id: outcomeIds[0], locked_odds: 2 })))
  if (legsErr) throw legsErr

  const aliceParlayId = parlays!.find((p) => p.profile_id === alice.id)!.id
  return { aliceClient, marketId, outcomeIds, aliceParlayId }
}

describe('parlays / parlay_legs select policies', () => {
  it('shows an invited member every parlay and leg', async () => {
    const { aliceClient } = await seedParlays()

    const { data: parlays, error } = await aliceClient.from('parlays').select('profile_id')
    expect(error).toBeNull()
    expect(new Set(parlays?.map((p) => p.profile_id))).toEqual(new Set([alice.id, bob.id]))

    const { data: legs, error: legsErr } = await aliceClient.from('parlay_legs').select('id')
    expect(legsErr).toBeNull()
    expect(legs).toHaveLength(2)
  })

  it('shows an admin every parlay and leg', async () => {
    await seedParlays()
    await giveRole(bob, 'admin')
    const bobClient = await clientFor(bob)

    const { data: parlays } = await bobClient.from('parlays').select('id')
    expect(parlays).toHaveLength(2)

    const { data: legs } = await bobClient.from('parlay_legs').select('id')
    expect(legs).toHaveLength(2)
  })

  it('shows an uninvited session no parlays or legs', async () => {
    await seedParlays()
    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)

    const { data: parlays } = await carolClient.from('parlays').select('id')
    expect(parlays).toEqual([])

    const { data: legs } = await carolClient.from('parlay_legs').select('id')
    expect(legs).toEqual([])
  })
})

describe('direct table writes', () => {
  it('rejects a direct insert into parlays', async () => {
    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.from('parlays').insert({ profile_id: alice.id, stake: 10, max_multiplier: 20 })
    expect(error?.code).toBe('42501')

    const { count } = await serviceClient().from('parlays').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('rejects a direct update to a parlay', async () => {
    const { aliceClient, aliceParlayId } = await seedParlays()
    const { error } = await aliceClient.from('parlays').update({ status: 'won', credited: 1000 }).eq('id', aliceParlayId)
    expect(error?.code).toBe('42501')

    const { data } = await serviceClient().from('parlays').select('status, credited').eq('id', aliceParlayId).single()
    expect(data).toEqual({ status: 'pending', credited: 0 })
  })

  it('rejects a direct delete of a parlay', async () => {
    const { aliceClient, aliceParlayId } = await seedParlays()
    const { error } = await aliceClient.from('parlays').delete().eq('id', aliceParlayId)
    expect(error?.code).toBe('42501')
  })

  it('rejects a direct insert into parlay_legs', async () => {
    const { aliceClient, aliceParlayId } = await seedParlays()
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })

    const { error } = await aliceClient
      .from('parlay_legs')
      .insert({ parlay_id: aliceParlayId, market_id: other.marketId, outcome_id: other.outcomeIds[0], locked_odds: 20 })
    expect(error?.code).toBe('42501')
  })
})
