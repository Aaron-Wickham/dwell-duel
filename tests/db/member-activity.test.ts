import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, anonClient, ensureInvited, type Member, giveRole } from './fixtures'
import { getAdminMember } from '@/lib/members/list-members'

// 0050 (#85): joined and last-signed-in dates for Admin -> Members, admins only.
let alice: Member
let bob: Member
let bobClient: SupabaseClient

type ActivityRow = { id: string; joined_at: string; last_sign_in_at: string | null }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function withRole(name: string, role: 'reviewer' | 'admin'): Promise<SupabaseClient> {
  const m = await makeMember(name)
  await giveRole(m, role)
  const client = await clientFor(m)
  await ensureInvited(client)
  return client
}

describe('member_activity', () => {
  it('refuses a plain member', async () => {
    const { data, error } = await bobClient.rpc('member_activity', { p_ids: [alice.id, bob.id] })
    expect(error?.message).toBe('only an admin can see member activity')
    expect(data).toBeNull()
  })

  it('refuses a reviewer', async () => {
    const rex = await withRole('Rex', 'reviewer')
    const { error } = await rex.rpc('member_activity', { p_ids: [bob.id] })
    expect(error?.message).toBe('only an admin can see member activity')
  })

  it('gives an admin each profile’s created_at and auth.users’ last sign-in', async () => {
    const ada = await withRole('Ada', 'admin')
    const { data, error } = await ada.rpc('member_activity', { p_ids: [alice.id, bob.id] })
    expect(error).toBeNull()
    const rows = new Map((data as ActivityRow[]).map((r) => [r.id, r]))
    expect([...rows.keys()].sort()).toEqual([alice.id, bob.id].sort())

    const db = serviceClient()
    const { data: profiles } = await db.from('profiles').select('id, created_at').in('id', [alice.id, bob.id])
    for (const p of profiles!) expect(Date.parse(rows.get(p.id)!.joined_at)).toBe(Date.parse(p.created_at))

    const { data: bobAuth } = await db.auth.admin.getUserById(bob.id)
    expect(bobAuth.user?.last_sign_in_at).toBeTruthy()
    expect(Date.parse(rows.get(bob.id)!.last_sign_in_at!)).toBe(Date.parse(bobAuth.user!.last_sign_in_at!))
    // Alice was made but never given a session in this test.
    expect(rows.get(alice.id)!.last_sign_in_at).toBeNull()
  })

  it('returns nothing for ids that aren’t members', async () => {
    const ada = await withRole('Ada', 'admin')
    const { data, error } = await ada.rpc('member_activity', { p_ids: ['00000000-0000-4000-8000-000000000000'] })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('is not callable signed out', async () => {
    const { error } = await anonClient().rpc('member_activity', { p_ids: [bob.id] })
    expect(error).not.toBeNull()
  })
})

describe('admin members with activity', () => {
  it('carries each member’s joined and last-active dates for an admin', async () => {
    const ada = await withRole('Ada', 'admin')
    const b = (await getAdminMember(ada, bob.id))!
    expect(b.joinedAt).not.toBeNull()
    expect(b.lastSignInAt).not.toBeNull()
    expect((await getAdminMember(ada, alice.id))!.lastSignInAt).toBeNull()
  })
})
