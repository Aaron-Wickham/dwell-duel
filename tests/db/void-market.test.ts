import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('void_market', () => {
  it('refunds every bet on the market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 20 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 30 })

    const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: aliceProfile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    expect(aliceProfile?.balance).toBe(100)

    const { data: bobProfile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(bobProfile?.balance).toBe(100)

    const { data: market } = await db.from('markets').select('status').eq('id', marketId).single()
    expect(market?.status).toBe('voided')
  })

  it('rejects voiding an already-resolved market', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)
    await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })

    const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId })
    expect(error).not.toBeNull()
  })

  it('rejects a non-creator, non-admin caller', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('void_market', { p_market_id: marketId })
    expect(error).not.toBeNull()
  })
})
