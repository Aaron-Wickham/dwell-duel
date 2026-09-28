import { describe, it, expect, beforeEach } from 'vitest'
import { revokeInvite } from '@/lib/invites/revoke-invite'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let admin: Member

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', admin.id)
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
    await serviceClient().from('allowed_emails').insert({ email: admin.email, claimed_by: admin.id })
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
