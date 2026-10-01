import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, makeAuthUserWithoutProfile, clientFor, ensureInvited, type Member } from './fixtures'
import { pruneUninvitedUsers } from '@/lib/auth/prune-uninvited-users'

// Pruning Google sign-ins that were never invited (#275, 0079).

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

const age = (id: string, interval: string) => pgQuery(`update auth.users set created_at = now() - interval '${interval}' where id = '${id}'`)

async function listed(): Promise<string[]> {
  const { data, error } = await serviceClient().rpc('uninvited_auth_users', { p_limit: 100 })
  if (error) throw error
  return (data as { id: string }[]).map((r) => r.id)
}

async function authUserExists(id: string): Promise<boolean> {
  const rows = await pgQuery<{ id: string }>(`select id from auth.users where id = '${id}'`)
  return rows.length === 1
}

describe('uninvited_auth_users', () => {
  it('lists only a stray sign-in a day old or more', async () => {
    const stray = await makeAuthUserWithoutProfile('stray@example.com')
    await makeAuthUserWithoutProfile('fresh@example.com')
    const invited = await makeAuthUserWithoutProfile('Invited@Example.com')
    await pgQuery("insert into public.allowed_emails (email) values ('invited@example.com')")
    await Promise.all([age(stray, '2 days'), age(invited, '2 days'), age(alice.id, '30 days')])

    // Alice has a profile but, as a fixture, no invite: like a removed member, who keeps the profile.
    expect(await listed()).toEqual([stray])
  })

  it('honours the limit, oldest first', async () => {
    const older = await makeAuthUserWithoutProfile('older@example.com')
    const newer = await makeAuthUserWithoutProfile('newer@example.com')
    await Promise.all([age(older, '5 days'), age(newer, '2 days')])
    const { data } = await serviceClient().rpc('uninvited_auth_users', { p_limit: 1 })
    expect((data as { id: string }[]).map((r) => r.id)).toEqual([older])
  })

  it('is callable by the service role only', async () => {
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.rpc('uninvited_auth_users', { p_limit: 100 })
    expect(error?.code).toBe('42501')
  })
})

describe('pruneUninvitedUsers', () => {
  it('deletes the stray sign-ins and nobody else', async () => {
    const stray = await makeAuthUserWithoutProfile('stray@example.com')
    const fresh = await makeAuthUserWithoutProfile('fresh@example.com')
    await Promise.all([age(stray, '2 days'), age(alice.id, '30 days')])

    expect(await pruneUninvitedUsers(serviceClient(), 50)).toBe(1)
    expect(await authUserExists(stray)).toBe(false)
    expect(await authUserExists(fresh)).toBe(true)
    expect(await authUserExists(alice.id)).toBe(true)
    expect(await pruneUninvitedUsers(serviceClient(), 50)).toBe(0)
  })
})
