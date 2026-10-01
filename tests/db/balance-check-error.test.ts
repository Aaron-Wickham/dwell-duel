import { describe, it, expect, beforeEach } from 'vitest'
import { isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import type { TestClient } from './helpers'

let alice: Member
let bob: Member
let aliceClient: TestClient
let bobClient: TestClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  for (const client of [aliceClient, bobClient]) await ensureInvited(client)
})

// The server actions map this exact error shape to the friendly insufficient-balance copy.
describe('over-balance errors', () => {
  it('place_bet reports the profiles balance check violation', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 101,
    })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('profiles_balance_check')
    expect(isBalanceCheckViolation(error)).toBe(true)
  })

  it('place_parlay reports the profiles balance check violation', async () => {
    await ensureInvited(bobClient)
    const legs: string[] = []
    for (const title of ['Market A', 'Market B']) {
      const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { title })
      const { error: betErr } = await aliceClient.rpc('place_bet', {
        p_market_id: marketId,
        p_outcome_id: outcomeIds[0],
        p_amount: 5,
      })
      if (betErr) throw betErr
      legs.push(outcomeIds[0])
    }

    const { error } = await bobClient.rpc('place_parlay', { p_outcome_ids: legs, p_stake: 101 })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('profiles_balance_check')
    expect(isBalanceCheckViolation(error)).toBe(true)
  })

  it('does not flag an unrelated rejection', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const { error } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 0,
    })

    expect(error?.message).toContain('bet amount must be positive')
    expect(isBalanceCheckViolation(error)).toBe(false)
  })
})
