import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient, wipeDatabase, reconcileBalances } from './helpers'
import { expectError } from './assertions'

let userId: string

beforeAll(async () => {
  await wipeDatabase()
  const db = serviceClient()

  const { data, error } = await db.auth.admin.createUser({
    email: 'schema-test@example.com',
    email_confirm: true,
  })
  if (error) throw error
  userId = data.user!.id
})

describe('profiles table', () => {
  it('accepts a valid row with the expected defaults', async () => {
    const db = serviceClient()
    const { data, error } = await db
      .from('profiles')
      .insert({ id: userId, email: 'schema-test@example.com', display_name: 'Test User' })
      .select('role, balance')
      .single()

    expect(error).toBeNull()
    expect(data?.role).toBe('member')
    expect(data?.balance).toBe(0)
  })

  it('rejects a negative balance', async () => {
    const db = serviceClient()
    const { error } = await db.from('profiles').update({ balance: -1 }).eq('id', userId)
    expectError(error, { code: '23514', message: 'profiles_balance_check' })
  })
})

describe('allowed_emails table', () => {
  it('enforces a unique email', async () => {
    const db = serviceClient()
    const { error: first } = await db.from('allowed_emails').insert({ email: 'dupe@example.com' })
    expect(first).toBeNull()

    const { error: second } = await db.from('allowed_emails').insert({ email: 'dupe@example.com' })
    expect(second).not.toBeNull()
  })
})

describe('coin_transactions table', () => {
  it('rejects a zero amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('coin_transactions')
      .insert({ profile_id: userId, amount: 0, type: 'test' })
    expectError(error, { code: '23514', message: 'coin_transactions_amount_check' })
  })

  it('accepts a nonzero amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('coin_transactions')
      .insert({ profile_id: userId, amount: 50, type: 'test' })
    expect(error).toBeNull()
    await reconcileBalances()
  })
})
