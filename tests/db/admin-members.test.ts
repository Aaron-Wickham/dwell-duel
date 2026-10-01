import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { pgQuery } from './pg-query'
import { seedMembers, makeMember, makeAuthUserWithoutProfile, clientFor, ensureInvited, giveRole, type Member } from './fixtures'
import { countMembers, getAdminMember, listMembersPage } from '@/lib/members/list-members'
import { getLeaderboardPage, getMemberStanding } from '@/lib/social/leaderboard'
import { PAGE_SIZE, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { readNamePageParams } from '@/lib/pagination/name-cursor'

// 0086 (#254, #265): Admin › Members at scale, and removed members out of the rankings.
let owner: Member
let bob: Member
let carol: Member
let ownerClient: SupabaseClient
let bobClient: SupabaseClient

const FIRST = { top: null, bottom: null }

beforeEach(async () => {
  ;[owner, bob] = await seedMembers()
  carol = await makeMember('Carol')
  await giveRole(owner, 'owner')
  ownerClient = await clientFor(owner)
  bobClient = await clientFor(bob)
  for (const c of [ownerClient, bobClient, await clientFor(carol)]) await ensureInvited(c)
})

async function remove(m: Member) {
  const { error } = await ownerClient.rpc('remove_member', { p_profile_id: m.id })
  if (error) throw error
}

describe('admin_members', () => {
  it('is for admins and the owner only', async () => {
    expect((await bobClient.rpc('admin_members', {})).error?.message).toBe('only an admin can list members')
    await giveRole(bob, 'reviewer')
    expect((await bobClient.rpc('admin_members', {})).error?.message).toBe('only an admin can list members')
    await giveRole(bob, 'admin')
    expect((await bobClient.rpc('admin_members', {})).error).toBeNull()
  })

  it('marks a removed member, with their email, and counts both tabs', async () => {
    await remove(carol)
    const c = await getAdminMember(ownerClient, carol.id)
    expect(c).toMatchObject({ id: carol.id, email: carol.email, removed: true, role: 'member' })
    expect((await getAdminMember(ownerClient, bob.id))?.removed).toBe(false)
    expect(await getAdminMember(ownerClient, '00000000-0000-4000-8000-000000000000')).toBeNull()
    expect(await countMembers(ownerClient, '')).toEqual({ active: 2, removed: 1 })

    const active = await listMembersPage(ownerClient, { query: '', removed: false, page: FIRST })
    const removed = await listMembersPage(ownerClient, { query: '', removed: true, page: FIRST })
    expect(active.rows.map((m) => m.displayName)).toEqual(['Alice', 'Bob'])
    expect(removed.rows.map((m) => m.displayName)).toEqual(['Carol'])
  })

  it('searches names and emails, any case, taking % and _ literally', async () => {
    const db = serviceClient()
    await db.from('profiles').update({ display_name: 'Car_l 100%' }).eq('id', carol.id)

    const byName = await listMembersPage(ownerClient, { query: 'BO', removed: false, page: FIRST })
    expect(byName.rows.map((m) => m.id)).toEqual([bob.id])
    const byEmail = await listMembersPage(ownerClient, { query: 'alice@exa', removed: false, page: FIRST })
    expect(byEmail.rows.map((m) => m.id)).toEqual([owner.id])
    expect((await listMembersPage(ownerClient, { query: 'r_l', removed: false, page: FIRST })).rows.map((m) => m.id)).toEqual([carol.id])
    expect((await listMembersPage(ownerClient, { query: '0%', removed: false, page: FIRST })).rows.map((m) => m.id)).toEqual([carol.id])
    expect((await listMembersPage(ownerClient, { query: 'a_i', removed: false, page: FIRST })).rows).toEqual([])
    expect(await countMembers(ownerClient, 'example.com')).toEqual({ active: 3, removed: 0 })
  })

  // #254: past 50, "Show more" reads on from the last row, A–Z, through a tie on the name.
  it('pages A–Z through every member, ties broken by id', async () => {
    const db = serviceClient()
    const extra = PAGE_SIZE + 4
    const ids: string[] = []
    for (let i = 0; i < extra; i += 10) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(10, extra - i) }, async (_, j) => {
          const k = i + j
          const email = `paged${k}@example.com`
          const id = await makeAuthUserWithoutProfile(email)
          // Six share a name, a quoted one, across the first page's boundary.
          const name = k >= 45 && k < 51 ? 'Same "Name", (x)' : `Paged ${String(k).padStart(2, '0')}`
          const { error } = await db.from('profiles').insert({ id, email, display_name: name })
          if (error) throw error
          await db.from('allowed_emails').insert({ email })
          return id
        }),
      )
      ids.push(...batch)
    }

    const first = await listMembersPage(ownerClient, { query: '', removed: false, page: FIRST })
    expect(first.rows).toHaveLength(PAGE_SIZE)
    expect(first.next?.kind).toBe('extend')
    const href = showMoreHref('/admin/members', {}, 'after', first.next!)
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams) as SearchParams
    const all = await listMembersPage(ownerClient, { query: '', removed: false, page: readNamePageParams(params, 'after') })
    expect(all.next).toBeNull()

    const expected = await pgQuery<{ id: string }>(`select id from public.profiles order by display_name, id`)
    expect(all.rows.map((m) => m.id)).toEqual(expected.map((r) => r.id))
    expect(first.next!.firstId).toBe(expected[PAGE_SIZE].id)
  })
})

describe('reinvite_member', () => {
  it('is the owner’s alone and needs a real member', async () => {
    await remove(carol)
    await giveRole(bob, 'admin')
    expect((await bobClient.rpc('reinvite_member', { p_profile_id: carol.id })).error?.message).toBe('only the owner can invite a member back')
    expect((await ownerClient.rpc('reinvite_member', { p_profile_id: '00000000-0000-4000-8000-000000000000' })).error?.message).toBe(
      'member not found',
    )
  })

  it('refuses a member with no email to invite', async () => {
    await remove(carol)
    const { error } = await serviceClient().from('profiles').update({ email: '  ' }).eq('id', carol.id)
    if (error) throw error
    expect((await ownerClient.rpc('reinvite_member', { p_profile_id: carol.id })).error?.message).toBe('this member has no email to invite')
  })

  it('gives a removed member their invite back, claimed by them, and ranks them again as a Member', async () => {
    await remove(carol)
    expect((await ownerClient.rpc('reinvite_member', { p_profile_id: carol.id })).error).toBeNull()
    const { data: invite } = await serviceClient().from('allowed_emails').select('claimed_by, invited_by').eq('email', carol.email).single()
    expect(invite).toEqual({ claimed_by: carol.id, invited_by: owner.id })
    expect(await getAdminMember(ownerClient, carol.id)).toMatchObject({ removed: false, role: 'member' })
    const board = await getLeaderboardPage(bobClient, 'all', FIRST)
    expect(board.rows.map((m) => m.id)).toContain(carol.id)
    // Twice is harmless.
    expect((await ownerClient.rpc('reinvite_member', { p_profile_id: carol.id })).error).toBeNull()
  })
})

describe('removed members aren’t ranked (#265)', () => {
  it('leaves them off the net-worth board and out of every rank and count, keeping their net worth', async () => {
    const db = serviceClient()
    await db.from('profiles').update({ balance: 500 }).eq('id', carol.id)
    expect((await getMemberStanding(bobClient, bob.id))?.memberCount).toBe(3)
    await remove(carol)

    const board = await getLeaderboardPage(bobClient, 'all', FIRST)
    expect(board.rows.map((m) => [m.id, m.rank])).toEqual([
      [owner.id, 1],
      [bob.id, 1],
    ])
    expect(await getMemberStanding(bobClient, bob.id)).toMatchObject({ rank: 1, memberCount: 2 })
    expect(await getMemberStanding(bobClient, carol.id)).toMatchObject({ score: 500, rank: null, memberCount: 2 })
  })

  it('leaves them off This month and out of the month’s champion', async () => {
    const now = new Date().toISOString()
    await pgQuery(
      `insert into public.coin_transactions (profile_id, amount, type, created_at) values
         ('${carol.id}', 300, 'bet_won', '${now}'), ('${bob.id}', 20, 'bet_won', '${now}'),
         ('${carol.id}', 300, 'bet_won', '2026-06-15T12:00:00Z'), ('${bob.id}', 20, 'bet_won', '2026-06-15T12:00:00Z')`,
    )
    await remove(carol)

    const month = await getLeaderboardPage(bobClient, 'month', FIRST)
    expect(month.rows.map((m) => m.id)).toEqual([bob.id])
    const { data: champion, error } = await serviceClient().rpc('settle_season', { p_month: '2026-06-01' })
    expect(error).toBeNull()
    expect(champion).toBe(bob.id)
  })

  it('tells only an invited session who is invited', async () => {
    const outsider = await clientFor(await makeMember('Dave'))
    expect((await outsider.rpc('invited_member_ids')).data).toEqual([])
    const ids = ((await bobClient.rpc('invited_member_ids')).data ?? []).map((r: { id: string }) => r.id)
    expect(ids.sort()).toEqual([owner.id, bob.id, carol.id].sort())
  })
})
