import { describe, it, expect, beforeEach } from 'vitest'
import { listInvites } from '@/lib/invites/list-invites'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let admin: Member

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('listInvites', () => {
  it('shows claimed and unclaimed invites', async () => {
    const db = serviceClient()
    await db.from('allowed_emails').insert([
      { email: 'unclaimed@example.com' },
      { email: admin.email, claimed_by: admin.id },
    ])

    const adminClient = await clientFor(admin)
    const invites = await listInvites(adminClient)

    const unclaimed = invites.find((i) => i.email === 'unclaimed@example.com')
    const claimed = invites.find((i) => i.email === admin.email)

    expect(unclaimed?.claimed).toBe(false)
    expect(claimed?.claimed).toBe(true)
  })
})
