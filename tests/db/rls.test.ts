import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { expectError } from './assertions'
import { seedMembers, clientFor, clientForEmail, makeAuthUserWithoutProfile, ensureInvited, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('profiles select policy', () => {
  it('denies a non-invited authenticated session any profile rows', async () => {
    // seedMembers() deliberately bypasses the real invite flow for fixture
    // speed (see ensureInvited()'s own doc comment in fixtures.ts), so
    // Alice is never actually invited here unless a test calls
    // ensureInvited() itself -- exactly the case this test exercises.
    const client = await clientFor(alice)
    const { data, error } = await client.from('profiles').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('lets an invited member read every profile', async () => {
    const client = await clientFor(alice)
    await ensureInvited(client)

    const { data, error } = await client.from('profiles').select('id')

    expect(error).toBeNull()
    const ids = new Set(data?.map((row) => row.id))
    expect(ids.has(alice.id)).toBe(true)
    expect(ids.has(bob.id)).toBe(true)
  })
})

describe('profiles insert policy', () => {
  it('rejects a non-invited user creating their own profile', async () => {
    const userId = await makeAuthUserWithoutProfile('notinvited@example.com')
    const client = await clientForEmail('notinvited@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'notinvited@example.com', display_name: 'Nope' })

    expectError(error, { code: '42501', message: 'new row violates row-level security policy for table "profiles"' })
    expect(error?.code).toBe('42501')
  })

  it("lets an invited user create their own profile, and the trigger claims their invite via their real session", async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee@example.com')
    const client = await clientForEmail('invitee@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee@example.com', display_name: 'Invitee' })
    expect(error).toBeNull()

    const db = serviceClient()
    const { data: profile } = await db.from('profiles').select('balance').eq('id', userId).single()
    expect(profile?.balance).toBe(100)

    const { data: invite } = await db
      .from('allowed_emails')
      .select('claimed_by')
      .eq('email', 'invitee@example.com')
      .single()
    expect(invite?.claimed_by).toBe(userId)
  })

  it('rejects an insert for a different id than the caller', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee2@example.com' })
    await makeAuthUserWithoutProfile('invitee2@example.com')
    const client = await clientForEmail('invitee2@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: bob.id, email: 'invitee2@example.com', display_name: 'Sneaky' })

    expectError(error, { code: '42501', message: 'new row violates row-level security policy for table "profiles"' })
  })

  it('rejects an insert that tries to set balance directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee3@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee3@example.com')
    const client = await clientForEmail('invitee3@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee3@example.com', display_name: 'Rich', balance: 999 } as never)

    expectError(error, { code: '42501', message: 'permission denied for table profiles' })
  })

  it('rejects an insert that tries to set a role directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee4@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee4@example.com')
    const client = await clientForEmail('invitee4@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee4@example.com', display_name: 'Boss', role: 'admin' } as never)

    expectError(error, { code: '42501', message: 'permission denied for table profiles' })
  })

  it("rejects an insert whose email does not match the caller's JWT email", async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee5@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee5@example.com')
    const client = await clientForEmail('invitee5@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'someoneelse@example.com', display_name: 'Spoofer' })

    expectError(error, { code: '42501', message: 'new row violates row-level security policy for table "profiles"' })
    expect(error?.code).toBe('42501')

    const { data: profile } = await serviceClient().from('profiles').select('id').eq('id', userId).maybeSingle()
    expect(profile).toBeNull()
  })
})

describe('profiles update policy', () => {
  it('denies a member self-granting a large balance via UPDATE', async () => {
    const client = await clientFor(alice)

    await client.from('profiles').update({ balance: 999999 }).eq('id', alice.id)

    const { data } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(data?.balance).toBe(100)
  })

  it('denies a member self-granting admin via UPDATE', async () => {
    const client = await clientFor(alice)

    await client.from('profiles').update({ role: 'admin' }).eq('id', alice.id)

    const { data } = await serviceClient().from('profiles').select('role').eq('id', alice.id).single()
    expect(data?.role).toBe('member')
  })
})

describe('allowed_emails policies', () => {
  it('denies a non-admin read/write', async () => {
    const client = await clientFor(alice)

    const { data: selectData, error: selectErr } = await client.from('allowed_emails').select('*')
    expect(selectErr).toBeNull()
    expect(selectData).toEqual([])

    const { error: insertErr } = await client.from('allowed_emails').insert({ email: 'x@example.com' })
    expectError(insertErr, { code: '42501', message: 'new row violates row-level security policy for table "allowed_emails"' })
  })

  it('allows an admin to read and write', async () => {
    await giveRole(alice, 'admin')
    const client = await clientFor(alice)

    const { error: insertErr } = await client.from('allowed_emails').insert({ email: 'y@example.com' })
    expect(insertErr).toBeNull()

    const { data, error: selectErr } = await client.from('allowed_emails').select('email')
    expect(selectErr).toBeNull()
    expect(data?.some((row) => row.email === 'y@example.com')).toBe(true)
  })

  it('denies a non-admin claiming an unclaimed invite via UPDATE', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'unclaimed@example.com' })
    const client = await clientFor(alice)

    await client.from('allowed_emails').update({ claimed_by: alice.id }).eq('email', 'unclaimed@example.com')

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('claimed_by')
      .eq('email', 'unclaimed@example.com')
      .single()
    expect(data?.claimed_by).toBeNull()
  })
})

describe('coin_transactions select policy', () => {
  it('shows a member only their own transactions', async () => {
    const client = await clientFor(alice)
    const { data, error } = await client.from('coin_transactions').select('profile_id')

    expect(error).toBeNull()
    expect(data?.every((row) => row.profile_id === alice.id)).toBe(true)
  })

  it('shows an admin every transaction', async () => {
    await giveRole(alice, 'admin')
    const client = await clientFor(alice)

    const { data, error } = await client.from('coin_transactions').select('profile_id')
    expect(error).toBeNull()
    const profileIds = new Set(data?.map((r) => r.profile_id))
    expect(profileIds.has(alice.id)).toBe(true)
    expect(profileIds.has(bob.id)).toBe(true)
  })
})

describe('coin_transactions write policies', () => {
  it('rejects a member inserting directly, bypassing apply_coin_transaction', async () => {
    const client = await clientFor(alice)

    const { error } = await client
      .from('coin_transactions')
      .insert({ profile_id: alice.id, amount: 1000000, type: 'admin_adjustment' })

    // There is no INSERT grant at all on this table for `authenticated`
    // (see migration 0006) — the only writer is apply_coin_transaction,
    // a SECURITY DEFINER function that bypasses RLS as its owner. So this
    // fails at the grant layer, not the RLS layer.
    expectError(error, { code: '42501', message: 'permission denied for table coin_transactions' })
    expect(error?.code).toBe('42501')

    const { count } = await serviceClient()
      .from('coin_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', alice.id)
      .eq('type', 'admin_adjustment')
    expect(count).toBe(0)
  })

  it('leaves an existing transaction unchanged after a member UPDATE attempt', async () => {
    const db = serviceClient()
    const { data: existing } = await db
      .from('coin_transactions')
      .select('id, amount')
      .eq('profile_id', alice.id)
      .single()

    const client = await clientFor(alice)
    await client.from('coin_transactions').update({ amount: 999999 }).eq('id', existing!.id)

    const { data: after } = await db.from('coin_transactions').select('amount').eq('id', existing!.id).single()
    expect(after?.amount).toBe(existing!.amount)
  })
})
