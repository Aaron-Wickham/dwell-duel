import { describe, it, expect, beforeEach } from 'vitest'
import { addInvite } from '@/lib/invites/add-invite'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let admin: Member
let member: Member

beforeEach(async () => {
  ;[admin, member] = await seedMembers()
  const { error } = await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
  if (error) throw error
})

describe('addInvite', () => {
  it('inserts a new row when the caller is an admin', async () => {
    const adminClient = await clientFor(admin)
    const result = await addInvite(adminClient, admin.id, 'newfriend@example.com')

    expect(result.ok).toBe(true)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email, invited_by')
      .eq('email', 'newfriend@example.com')
      .single()
    expect(data?.invited_by).toBe(admin.id)
  })

  it('lowercases and trims the email before inserting', async () => {
    const adminClient = await clientFor(admin)
    const result = await addInvite(adminClient, admin.id, '  Shouty@Example.com  ')

    expect(result.ok).toBe(true)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', 'shouty@example.com')
      .maybeSingle()
    expect(data).not.toBeNull()
  })

  it('rejects an invalid email address without touching the database', async () => {
    const adminClient = await clientFor(admin)
    const result = await addInvite(adminClient, admin.id, 'not-an-email')

    expect(result.ok).toBe(false)
    expect(result.formError).toBe('Enter a valid email address.')
  })

  it('reports a friendly error for a duplicate email', async () => {
    const adminClient = await clientFor(admin)
    await addInvite(adminClient, admin.id, 'dupe@example.com')
    const second = await addInvite(adminClient, admin.id, 'dupe@example.com')

    expect(second.ok).toBe(false)
    expect(second.formError).toBe('That email is already invited.')
  })

  it('refuses a non-admin at the RLS layer — no row is inserted', async () => {
    const memberClient = await clientFor(member)
    const result = await addInvite(memberClient, member.id, 'sneaky@example.com')

    expect(result.ok).toBe(false)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', 'sneaky@example.com')
      .maybeSingle()
    expect(data).toBeNull()
  })
})
