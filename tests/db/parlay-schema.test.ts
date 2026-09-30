import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, expectError } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

async function insertParlay(profileId: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from('parlays')
    .insert({ profile_id: profileId, stake: 10, max_multiplier: 20 })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

describe('parlays table', () => {
  it('defaults a new parlay to pending with nothing credited', async () => {
    const id = await insertParlay(alice.id)
    const { data } = await serviceClient().from('parlays').select('status, credited, settled_at').eq('id', id).single()
    expect(data).toEqual({ status: 'pending', credited: 0, settled_at: null })
  })

  it('rejects a non-positive stake', async () => {
    const { error } = await serviceClient().from('parlays').insert({ profile_id: alice.id, stake: 0, max_multiplier: 20 })
    expectError(error, { code: '23514', message: 'parlays_stake_check' })
  })

  it('needs the multiplier cap it was placed under, at least 1', async () => {
    const missing = await serviceClient().from('parlays').insert({ profile_id: alice.id, stake: 10 } as never)
    expectError(missing.error, { code: '23502', message: 'max_multiplier' })
    const zero = await serviceClient().from('parlays').insert({ profile_id: alice.id, stake: 10, max_multiplier: 0 })
    expectError(zero.error, { code: '23514', message: 'parlays_max_multiplier_check' })
  })

  it('rejects an unknown status', async () => {
    const { error } = await serviceClient()
      .from('parlays')
      .insert({ profile_id: alice.id, stake: 10, status: 'cashed_out', max_multiplier: 20 })
    expectError(error, { code: '23514', message: 'parlays_status_check' })
  })
})

describe('parlay_legs table', () => {
  it('rejects locked odds below 1', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    const parlayId = await insertParlay(alice.id)

    const { error } = await serviceClient()
      .from('parlay_legs')
      .insert({ parlay_id: parlayId, market_id: marketId, outcome_id: outcomeIds[0], locked_odds: 0.5 })
    expectError(error, { code: '23514', message: 'parlay_legs_locked_odds_check' })
  })

  it('leaves a leg’s odds empty until its market closes', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    const parlayId = await insertParlay(alice.id)

    const { error } = await serviceClient()
      .from('parlay_legs')
      .insert({ parlay_id: parlayId, market_id: marketId, outcome_id: outcomeIds[0], locked_odds: null })
    expect(error).toBeNull()
  })

  it('rejects two legs on the same market in one parlay', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    const parlayId = await insertParlay(alice.id)
    const db = serviceClient()

    const first = await db
      .from('parlay_legs')
      .insert({ parlay_id: parlayId, market_id: marketId, outcome_id: outcomeIds[0], locked_odds: 2 })
    expect(first.error).toBeNull()

    const second = await db
      .from('parlay_legs')
      .insert({ parlay_id: parlayId, market_id: marketId, outcome_id: outcomeIds[1], locked_odds: 2 })
    expectError(second.error, { code: '23505', message: 'parlay_legs_parlay_id_market_id_key' })
  })
})
