import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { ensureInvited, seedMembers, clientFor, createTestMarket, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  for (const m of [alice, bob]) await ensureInvited(await clientFor(m))
})

describe('place_bet', () => {
  it('debits the bettor and increases the outcome pool together', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 30,
    })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(profile?.balance).toBe(70) // 100 starting grant - 30

    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(30)
  })

  it('rejects an insufficient balance, leaving the ledger and pool unchanged', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 1000,
    })
    expect(error).not.toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(profile?.balance).toBe(100)

    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(0)
  })

  it('rejects betting after close_at', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })

    await serviceClient()
      .from('markets')
      .update({ close_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', marketId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 10,
    })
    expect(error).not.toBeNull()
  })

  it('rejects an outcome that belongs to a different market', async () => {
    const aliceClient = await clientFor(alice)
    const marketA = await createTestMarket(aliceClient, ['Yes', 'No'])
    const marketB = await createTestMarket(aliceClient, ['Red', 'Blue'])

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketA.marketId,
      p_outcome_id: marketB.outcomeIds[0],
      p_amount: 10,
    })
    expect(error).not.toBeNull()
  })

  it('stacks two bets on the same outcome', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 15 })

    const db = serviceClient()
    const { data: outcome } = await db.from('market_outcomes').select('pool_total').eq('id', outcomeIds[0]).single()
    expect(outcome?.pool_total).toBe(25)

    const { data: profile } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    expect(profile?.balance).toBe(75)
  })
})
