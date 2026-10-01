import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('adjust_balance', () => {
  it('rejects a non-admin caller', async () => {
    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 10,
      p_reason: 'test',
    })
    expectError(error, 'only the owner can adjust a balance')
  })

  it('rejects an admin who is not the owner', async () => {
    await giveRole(bob, 'admin')
    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('adjust_balance', { p_profile_id: alice.id, p_amount: 10, p_reason: 'test' })
    expect(error?.message).toBe('only the owner can adjust a balance')
  })

  it('rejects a zero amount', async () => {
    await giveRole(bob, 'owner')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 0,
      p_reason: 'test',
    })
    expectError(error, 'adjustment amount must not be zero')
  })

  it('rejects a missing reason', async () => {
    await giveRole(bob, 'owner')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 10,
      // Deliberately not a string: the function must refuse a missing reason itself.
      p_reason: null as unknown as string,
    })
    expectError(error, 'a reason is required for a balance adjustment')
  })

  it('rejects a blank (whitespace-only) reason', async () => {
    await giveRole(bob, 'owner')
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 10,
      p_reason: '   ',
    })
    expectError(error, 'a reason is required for a balance adjustment')
  })

  it('credits a balance through the real ledger', async () => {
    await giveRole(bob, 'owner')
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 25,
      p_reason: 'Bonus for helping set up chairs',
    })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance + 25)

    const { data: txns } = await serviceClient()
      .from('coin_transactions')
      .select('amount, type, meta')
      .eq('profile_id', alice.id)
      .eq('type', 'admin_adjustment')
    expect(txns).toContainEqual(
      expect.objectContaining({
        amount: 25,
        type: 'admin_adjustment',
        meta: expect.objectContaining({ reason: 'Bonus for helping set up chairs', adjusted_by: bob.id }),
      }),
    )
  })

  it('debits a balance through the real ledger', async () => {
    await giveRole(bob, 'owner')
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: -20,
      p_reason: 'Correcting an over-payment',
    })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance - 20)
  })

  it('rejects a debit that would take the balance negative', async () => {
    await giveRole(bob, 'owner')
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: -(before!.balance + 1),
      p_reason: 'Would go negative',
    })
    expectError(error, { code: '23514', message: 'profiles_balance_check' })

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance)
  })
})
