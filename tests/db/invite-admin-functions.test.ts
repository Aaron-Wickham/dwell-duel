import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, clientForEmail, makeAuthUserWithoutProfile, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('is_invited', () => {
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
    await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    const client = await clientFor(bob)

    const { data } = await client.rpc('is_admin')
    expect(data).toBe(true)
  })
})
