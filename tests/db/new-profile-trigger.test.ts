import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { makeAuthUserWithoutProfile } from './fixtures'

beforeEach(async () => {
  const db = serviceClient()
  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)
})

describe('handle_new_profile trigger', () => {
  it('grants exactly the 100-coin starting balance on insert', async () => {
    const db = serviceClient()
    const userId = await makeAuthUserWithoutProfile('newmember@example.com')

    const { error } = await db
      .from('profiles')
      .insert({ id: userId, email: 'newmember@example.com', display_name: 'New Member' })
    expect(error).toBeNull()

    const { data: profile } = await db.from('profiles').select('balance').eq('id', userId).single()
    expect(profile?.balance).toBe(100)

    const { data: txns } = await db.from('coin_transactions').select('amount, type').eq('profile_id', userId)
    expect(txns).toEqual([{ amount: 100, type: 'starting_grant' }])
  })
})
