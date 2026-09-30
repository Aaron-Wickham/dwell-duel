import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, expectError } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('apply_coin_transaction', () => {
  it('inserts a ledger row and updates the balance together', async () => {
    const db = serviceClient()
    const { error } = await db.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: 50,
      p_type: 'test_credit',
    })
    expect(error).toBeNull()

    const { data: profile } = await db.from('profiles').select('balance').eq('id', alice.id).single()
    const { data: txns } = await db.from('coin_transactions').select('amount').eq('profile_id', alice.id)

    const ledgerSum = (txns ?? []).reduce((sum, t) => sum + t.amount, 0)
    expect(profile?.balance).toBe(ledgerSum)
    // seedMembers()'s own profile-creation trigger now grants +100 (Task 4), so
    // the expected total is that starting grant plus this test's own +50 credit.
    expect(profile?.balance).toBe(150)
  })

  it('rejects an over-draft, leaving the ledger and balance unchanged', async () => {
    const db = serviceClient()
    const { data: before } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    const { count: countBefore } = await db
      .from('coin_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', bob.id)

    const { error } = await db.rpc('apply_coin_transaction', {
      p_profile_id: bob.id,
      p_amount: -(before!.balance + 1),
      p_type: 'test_overdraft',
    })
    expectError(error, { code: '23514', message: 'profiles_balance_check' })

    const { data: after } = await db.from('profiles').select('balance').eq('id', bob.id).single()
    const { count: countAfter } = await db
      .from('coin_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', bob.id)

    expect(after?.balance).toBe(before?.balance)
    expect(countAfter).toBe(countBefore)
  })

  it('cannot be called directly by a regular authenticated user', async () => {
    const client = await clientFor(alice)
    const { error } = await client.rpc('apply_coin_transaction', {
      p_profile_id: alice.id,
      p_amount: 1000000,
      p_type: 'self_grant_attempt',
    })
    expectError(error, { code: '42501', message: 'permission denied for function apply_coin_transaction' })

    const { data: profile } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    // The self-grant attempt was correctly rejected, so the balance is unchanged
    // from the 100 starting grant (the only transaction this profile has).
    expect(profile?.balance).toBe(100)
  })
})
