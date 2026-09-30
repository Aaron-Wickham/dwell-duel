import { describe, it, expect, beforeEach } from 'vitest'
import { listInvites } from '@/lib/invites/list-invites'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member, giveRole } from './fixtures'

let admin: Member

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await giveRole(admin, 'admin')
})

describe('listInvites', () => {
  it('shows claimed and unclaimed invites', async () => {
    const db = serviceClient()
    // giveRole already invited the admin, so their row is updated rather than inserted.
    await db.from('allowed_emails').upsert([{ email: 'unclaimed@example.com' }, { email: admin.email, claimed_by: admin.id }], { onConflict: 'email' })

    const adminClient = await clientFor(admin)
    const invites = await listInvites(adminClient)

    const unclaimed = invites.find((i) => i.email === 'unclaimed@example.com')
    const claimed = invites.find((i) => i.email === admin.email)

    expect(unclaimed?.claimed).toBe(false)
    expect(claimed?.claimed).toBe(true)
  })
})
