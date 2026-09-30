import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient, wipeDatabase } from './helpers'
import { clientForEmail, makeAuthUserWithoutProfile } from './fixtures'
import { createOwnProfile } from '@/lib/auth/create-own-profile'

beforeEach(async () => {
  await wipeDatabase()
})

describe('createOwnProfile', () => {
  it('returns not_invited for an email not on the allowlist', async () => {
    const userId = await makeAuthUserWithoutProfile('outsider@example.com')
    const client = await clientForEmail('outsider@example.com')

    const result = await createOwnProfile(client, userId, 'outsider@example.com', 'Outsider', null)
    expect(result).toEqual({ ok: false, reason: 'not_invited' })
  })

  it('creates the profile for an invited email', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'welcome@example.com' })
    const userId = await makeAuthUserWithoutProfile('welcome@example.com')
    const client = await clientForEmail('welcome@example.com')

    const result = await createOwnProfile(
      client,
      userId,
      'welcome@example.com',
      'Welcome',
      'https://example.com/a.png',
    )
    expect(result).toEqual({ ok: true })

    const { data: profile } = await serviceClient().from('profiles').select('balance').eq('id', userId).single()
    expect(profile?.balance).toBe(100)
  })

  it('treats an already-existing profile as success (idempotent)', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'returning@example.com' })
    const userId = await makeAuthUserWithoutProfile('returning@example.com')
    const client = await clientForEmail('returning@example.com')

    const first = await createOwnProfile(client, userId, 'returning@example.com', 'Returning', null)
    expect(first).toEqual({ ok: true })

    const second = await createOwnProfile(client, userId, 'returning@example.com', 'Returning', null)
    expect(second).toEqual({ ok: true })
  })
})
