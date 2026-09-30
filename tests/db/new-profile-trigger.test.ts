import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, wipeDatabase } from './helpers'
import { makeAuthUserWithoutProfile } from './fixtures'

beforeEach(async () => {
  await wipeDatabase()
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
