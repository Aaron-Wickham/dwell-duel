import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, clientFor, clientForEmail, makeAuthUserWithoutProfile, type Member, giveRole } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('is_invited', () => {
  // GHSA-qxxc-jg94-c49j (0112): an invited email isn't enough; the account must sign in with
  // Google. Tests sign in with magic links, which the seed's app_flags row allows locally.
  it('refuses an invited email signed in without Google once email sign-in is not allowed', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'pending@example.com' })
    await makeAuthUserWithoutProfile('pending@example.com')
    const client = await clientForEmail('pending@example.com')
    await pgQuery(`delete from public.app_flags where key = 'allow_email_sign_in'`)
    try {
      const { data, error } = await client.rpc('is_invited')
      expect(error).toBeNull()
      expect(data).toBe(false)
    } finally {
      await pgQuery(`insert into public.app_flags (key) values ('allow_email_sign_in') on conflict do nothing`)
    }
  })

  it('admits an invited email whose account has a Google identity, without the flag', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'googler@example.com' })
    const id = await makeAuthUserWithoutProfile('googler@example.com')
    await pgQuery(`delete from public.app_flags where key = 'allow_email_sign_in'`)
    try {
      // A Google session's claims carry app_metadata.providers with google in it.
      const claims = JSON.stringify({ sub: id, email: 'googler@example.com', role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] } })
      const rows = await pgQuery<{ invited: boolean }>(
        `select public.is_invited() as invited from (select set_config('request.jwt.claims', '${claims}', true)) as s`,
      )
      expect(rows[0].invited).toBe(true)
    } finally {
      await pgQuery(`insert into public.app_flags (key) values ('allow_email_sign_in') on conflict do nothing`)
    }
  })

  it('is true for an authenticated email on the allowlist', async () => {
    await serviceClient().from('allowed_emails').insert({ email: 'pending@example.com' })
    await makeAuthUserWithoutProfile('pending@example.com')
    const client = await clientForEmail('pending@example.com')

    const { data, error } = await client.rpc('is_invited')
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('is false for an authenticated email not on the allowlist', async () => {
    await makeAuthUserWithoutProfile('stranger@example.com')
    const client = await clientForEmail('stranger@example.com')

    const { data } = await client.rpc('is_invited')
    expect(data).toBe(false)
  })
})

describe('is_admin', () => {
  it('is false for a regular member', async () => {
    const client = await clientFor(alice)
    const { data } = await client.rpc('is_admin')
    expect(data).toBe(false)
  })

  it('is true once the profile row is promoted', async () => {
    await giveRole(bob, 'admin')
    const client = await clientFor(bob)

    const { data } = await client.rpc('is_admin')
    expect(data).toBe(true)
  })
})
