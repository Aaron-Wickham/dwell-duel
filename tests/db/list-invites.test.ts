import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countInvites, encodeInviteCursor, listInvitesPage, readInvitePageParams, type InvitePageParams } from '@/lib/invites/list-invites'
import { PAGE_SIZE, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member, giveRole } from './fixtures'

let admin: Member
let adminClient: SupabaseClient

const FIRST: InvitePageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[admin] = await seedMembers()
  await giveRole(admin, 'admin')
  adminClient = await clientFor(admin)
})

async function invite(rows: { email: string; created_at?: string; claimed_by?: string }[]) {
  const { error } = await serviceClient().from('allowed_emails').upsert(rows, { onConflict: 'email' })
  if (error) throw error
}

describe('listInvitesPage', () => {
  it('splits waiting invites from claimed ones', async () => {
    await invite([{ email: 'unclaimed@example.com' }, { email: admin.email.toLowerCase(), claimed_by: admin.id }])

    const waiting = await listInvitesPage(adminClient, { query: '', claimed: false, page: FIRST })
    const claimed = await listInvitesPage(adminClient, { query: '', claimed: true, page: FIRST })

    expect(waiting.rows.map((i) => [i.email, i.claimed])).toEqual([['unclaimed@example.com', false]])
    expect(claimed.rows.map((i) => [i.email, i.claimed])).toEqual([[admin.email.toLowerCase(), true]])
    expect(await countInvites(adminClient, '')).toEqual({ waiting: 1, claimed: 1 })
  })

  it('searches emails anywhere in them, taking % and _ literally', async () => {
    await invite([{ email: 'pat_k@example.com' }, { email: 'patek@example.com' }, { email: 'lee@church.org' }])

    const pat = await listInvitesPage(adminClient, { query: 'PAT', claimed: false, page: FIRST })
    expect(pat.rows.map((i) => i.email).sort()).toEqual(['pat_k@example.com', 'patek@example.com'])
    const underscore = await listInvitesPage(adminClient, { query: 't_k', claimed: false, page: FIRST })
    expect(underscore.rows.map((i) => i.email)).toEqual(['pat_k@example.com'])
    const percent = await listInvitesPage(adminClient, { query: '%', claimed: false, page: FIRST })
    expect(percent.rows).toEqual([])
    expect(await countInvites(adminClient, 'church')).toEqual({ waiting: 1, claimed: 0 })
  })

  // #254: past the first 50, "Show more" reads on from the last row, newest first, through ties.
  it('pages newest first through every invite, ties broken by email', async () => {
    const tied = '2026-09-01T12:00:00+00:00'
    const rows = Array.from({ length: PAGE_SIZE + 7 }, (_, i) => ({
      email: `friend${String(i).padStart(3, '0')}@example.com`,
      // Ten share one timestamp, so a page boundary falls inside the tie.
      created_at: i >= 45 && i < 55 ? tied : new Date(Date.UTC(2026, 8, 2, 0, i)).toISOString(),
    }))
    await invite(rows)

    const first = await listInvitesPage(adminClient, { query: '', claimed: false, page: FIRST })
    expect(first.rows).toHaveLength(PAGE_SIZE)
    expect(first.next?.kind).toBe('extend')

    const href = showMoreHref('/admin/invites', {}, 'before', first.next!)
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams) as SearchParams
    const both = await listInvitesPage(adminClient, { query: '', claimed: false, page: readInvitePageParams(params, 'before') })
    expect(both.next).toBeNull()

    const { data: expected } = await serviceClient()
      .from('allowed_emails')
      .select('email')
      .is('claimed_by', null)
      .order('created_at', { ascending: false })
      .order('email', { ascending: false })
    expect(both.rows.map((r) => r.email)).toEqual(expected!.map((r) => r.email))
    expect(first.next!.firstId).toBe(expected![PAGE_SIZE].email)
  })

  it('ignores a tampered cursor', async () => {
    await invite([{ email: 'a@example.com' }])
    const bad = encodeInviteCursor({ ts: '2026-02-30T00:00:00Z', id: 'a@example.com' })
    expect(readInvitePageParams({ before: bad }, 'before')).toEqual(FIRST)
    expect(readInvitePageParams({ before: 'not!base64' }, 'before')).toEqual(FIRST)
    // A quote in the email reaches the filter as a literal.
    const quoted = { top: null, bottom: { ts: '2026-09-01T00:00:00+00:00', id: 'x"),or(email.eq.a@example.com' } }
    await expect(listInvitesPage(adminClient, { query: '', claimed: false, page: quoted })).resolves.toBeDefined()
  })
})
