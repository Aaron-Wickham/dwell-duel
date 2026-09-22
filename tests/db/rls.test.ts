import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, clientForEmail, makeAuthUserWithoutProfile, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('profiles insert policy', () => {
  it('rejects a non-invited user creating their own profile', async () => {
    const userId = await makeAuthUserWithoutProfile('notinvited@example.com')
    const client = await clientForEmail('notinvited@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'notinvited@example.com', display_name: 'Nope' })

    expect(error).not.toBeNull()
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

    expect(error).not.toBeNull()
  })

  it('rejects an insert that tries to set balance directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee3@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee3@example.com')
    const client = await clientForEmail('invitee3@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee3@example.com', display_name: 'Rich', balance: 999 } as never)

    expect(error).not.toBeNull()
  })

  it('rejects an insert that tries to set is_admin directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'invitee4@example.com' })
    const userId = await makeAuthUserWithoutProfile('invitee4@example.com')
    const client = await clientForEmail('invitee4@example.com')

    const { error } = await client
      .from('profiles')
      .insert({ id: userId, email: 'invitee4@example.com', display_name: 'Boss', is_admin: true } as never)

    expect(error).not.toBeNull()
  })
})

describe('allowed_emails policies', () => {
  it('denies a non-admin read/write', async () => {
    const client = await clientFor(alice)

    const { data: selectData, error: selectErr } = await client.from('allowed_emails').select('*')
    expect(selectErr).toBeNull()
    expect(selectData).toEqual([])

    const { error: insertErr } = await client.from('allowed_emails').insert({ email: 'x@example.com' })
    expect(insertErr).not.toBeNull()
  })

  it('allows an admin to read and write', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const client = await clientFor(alice)

    const { error: insertErr } = await client.from('allowed_emails').insert({ email: 'y@example.com' })
    expect(insertErr).toBeNull()

    const { data, error: selectErr } = await client.from('allowed_emails').select('email')
    expect(selectErr).toBeNull()
    expect(data?.some((row) => row.email === 'y@example.com')).toBe(true)
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
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const client = await clientFor(alice)

    const { data, error } = await client.from('coin_transactions').select('profile_id')
    expect(error).toBeNull()
    const profileIds = new Set(data?.map((r) => r.profile_id))
    expect(profileIds.has(alice.id)).toBe(true)
    expect(profileIds.has(bob.id)).toBe(true)
  })
})
