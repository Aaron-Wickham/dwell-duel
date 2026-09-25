import { describe, it, expect, beforeEach } from 'vitest'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, type Member } from './fixtures'

let admin: Member
let bob: Member

beforeEach(async () => {
  ;[admin, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

describe('listAllTransactions', () => {
  it("carries each entry's member id alongside their name", async () => {
    const adminClient = await clientFor(admin)
    await ensureInvited(adminClient)

    const entries = await listAllTransactions(adminClient)

    expect(entries).toContainEqual(
      expect.objectContaining({ profileId: bob.id, memberName: 'Bob', amount: 100, type: 'Starting grant' }),
    )
  })
})
