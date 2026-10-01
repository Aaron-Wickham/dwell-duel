import { describe, it, expect, beforeEach } from 'vitest'
import { revokeInvite } from '@/lib/invites/revoke-invite'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, type Member, giveRole } from './fixtures'

let admin: Member

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await giveRole(admin, 'admin')
})

describe('revokeInvite', () => {
  it('deletes an unclaimed invite', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'unclaimed@example.com' })
    const adminClient = await clientFor(admin)

    const result = await revokeInvite(adminClient, 'unclaimed@example.com')
    expect(result.ok).toBe(true)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', 'unclaimed@example.com')
      .maybeSingle()
    expect(data).toBeNull()
  })

  it('leaves a claimed invite in place', async () => {
    // giveRole already invited the admin; mark that invite claimed.
    await serviceClient().from('allowed_emails').update({ claimed_by: admin.id }).eq('email', admin.email)
    const adminClient = await clientFor(admin)

    await revokeInvite(adminClient, admin.email)

    const { data } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .eq('email', admin.email)
      .maybeSingle()
    expect(data).not.toBeNull()
  })
})

// 0073: the database, not just revokeInvite, keeps a claimed invite from an admin. Removing a
// member, and with them their claimed invite, is remove_member's alone (owner only).
describe('admin_delete_invites', () => {
  async function inviteExists(email: string) {
    const { data } = await serviceClient().from('allowed_emails').select('email').eq('email', email).maybeSingle()
    return data !== null
  }

  it('deletes nothing claimed when an admin deletes directly, their own, a member’s or the owner’s', async () => {
    const owner = await makeMember('Olive')
    const member = await makeMember('Mo')
    await giveRole(owner, 'owner')
    await giveRole(member, 'member')
    const db = serviceClient()
    for (const m of [admin, owner, member]) {
      const { error } = await db.from('allowed_emails').update({ claimed_by: m.id }).eq('email', m.email)
      if (error) throw error
    }
    const adminClient = await clientFor(admin)

    for (const m of [owner, member, admin]) {
      const { data, error } = await adminClient.from('allowed_emails').delete().eq('email', m.email).select('email')
      expect(error).toBeNull()
      expect(data, m.displayName).toEqual([])
      expect(await inviteExists(m.email)).toBe(true)
    }
    const { data: all, error: allErr } = await adminClient.from('allowed_emails').delete().not('claimed_by', 'is', null).select('email')
    expect(allErr).toBeNull()
    expect(all).toEqual([])
    expect((await adminClient.rpc('my_role')).data).toBe('admin')
  })

  it('still lets an admin delete an unclaimed invite directly', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'pending@example.com' })
    const adminClient = await clientFor(admin)

    const { data, error } = await adminClient.from('allowed_emails').delete().eq('email', 'pending@example.com').select('email')
    expect(error).toBeNull()
    expect(data).toEqual([{ email: 'pending@example.com' }])
    expect(await inviteExists('pending@example.com')).toBe(false)
  })
})
