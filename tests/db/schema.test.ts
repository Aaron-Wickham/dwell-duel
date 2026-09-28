import { describe, it, expect, beforeAll } from 'vitest'
import { deleteAllAuthUsers, serviceClient } from './helpers'

let userId: string

beforeAll(async () => {
  const db = serviceClient()
  await db.from('markets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('coin_transactions').delete().gte('id', 0)
  await db.from('allowed_emails').delete().neq('email', '')
  await db.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await deleteAllAuthUsers(db)

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
      .select('is_admin, balance')
      .single()

    expect(error).toBeNull()
    expect(data?.is_admin).toBe(false)
    expect(data?.balance).toBe(0)
  })

  it('rejects a negative balance', async () => {
    const db = serviceClient()
    const { error } = await db.from('profiles').update({ balance: -1 }).eq('id', userId)
    expect(error).not.toBeNull()
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
    expect(error).not.toBeNull()
  })

  it('accepts a nonzero amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('coin_transactions')
      .insert({ profile_id: userId, amount: 50, type: 'test' })
    expect(error).toBeNull()
  })
})
