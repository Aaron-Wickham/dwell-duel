import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient, deleteAuthUser } from './helpers'
import { seedMembers, makeMember, clientFor, ensureInvited } from './fixtures'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { showMoreHref } from '@/lib/pagination/cursor'
import { encodeRankCursor, readRankPageParams, type RankCursor } from '@/lib/pagination/rank-cursor'

type Profile = { id: string; display_name: string; balance: number }

// Six members tie at positions 48–53 of 60, across the first page's boundary at 50. Their names
// are ones a PostgREST filter has to quote and escape, so the probe and every cursor built from
// the tie carry them.
const TIED_NAMES = ['O"Brien, (Jr.)', 'Back\\slash', 'x"),id.gt.(0', 'Zoë 🎲', 'a,b.c:d', 'Ann (the 2nd)']
const TIE_START = 47
// Between the balances either side of the tie: 1000 - 46 above it and 1000 - 53 below.
const TIE_BALANCE = 950
const EXTRA_MEMBERS = 58

let bobClient: SupabaseClient
// Every member this file adds is deleted in afterAll, so a local run doesn't accumulate them.
// seedMembers() wipes every auth user before seeding, so a run killed before cleanup can't strand
// extras for the next file's own seedMembers() to trip over — afterAll just keeps a repeated
// local run tidy.
const extras: string[] = []
let board: (Profile & { rank: number })[]

const keyOf = (p: Profile): RankCursor => ({ score: p.balance, name: p.display_name, id: p.id })

// Competition ranks over a board already in order: a tie shares the rank of its first member.
function withRanks(sorted: Profile[]): (Profile & { rank: number })[] {
  return sorted.map((p) => ({ ...p, rank: sorted.findIndex((q) => q.balance === p.balance) + 1 }))
}
const summary = (rows: { id: string; rank: number }[]) => rows.map((m) => [m.id, m.rank])

beforeAll(async () => {
  const [alice, bob] = await seedMembers()
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  for (let i = 0; i < EXTRA_MEMBERS; i += 10) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(10, EXTRA_MEMBERS - i) }, (_, j) => makeMember(`Ranked${String(i + j).padStart(2, '0')}`)),
    )
    extras.push(...batch.map((m) => m.id))
  }

  const db = serviceClient()
  const everyone = [alice.id, bob.id, ...extras]
  // Only invited members are ranked (0086), so every member here gets an invite, claimed.
  const { error: inviteErr } = await db.from('allowed_emails').upsert(
    everyone.map((id) => ({ email: `invite-${id}@example.com`, claimed_by: id })),
    { onConflict: 'email' },
  )
  if (inviteErr) throw inviteErr
  await Promise.all(
    everyone.map(async (id, k) => {
      const tied = k >= TIE_START && k < TIE_START + TIED_NAMES.length
      const update = tied ? { balance: TIE_BALANCE, display_name: TIED_NAMES[k - TIE_START] } : { balance: 1000 - k }
      const { error } = await db.from('profiles').update(update).eq('id', id)
      if (error) throw error
    }),
  )

  // The expected board comes from the database's own order, so the names in the tie sort by its
  // collation, the same one the reader's filters compare with.
  const { data, error } = await db
    .from('profiles')
    .select('id, display_name, balance')
    .order('balance', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  board = withRanks(data as Profile[])
}, 60_000)

afterAll(async () => {
  const db = serviceClient()
  // Each profile's starting grant goes with it: coin_transactions.profile_id cascades (0001).
  if (extras.length > 0) {
    const { error } = await db.from('profiles').delete().in('id', extras)
    if (error) throw error
  }
  for (const id of extras) await deleteAuthUser(db, id)
}, 60_000)

describe('getLeaderboardPage', () => {
  it('sets up a board of 60 with the tie across the page boundary', () => {
    expect(board).toHaveLength(60)
    expect(board.slice(TIE_START, TIE_START + 6).map((m) => m.balance)).toEqual(Array(6).fill(TIE_BALANCE))
    expect(board.slice(TIE_START, TIE_START + 6).every((m) => m.rank === 48)).toBe(true)
    expect(board[TIE_START + 6].rank).toBe(54)
  })

  it('pages 50 at a time, and Show more ranks the tie the same on both sides of the boundary', async () => {
    const first = await getLeaderboardPage(bobClient, 'all', { top: null, bottom: null })
    expect(summary(first.rows)).toEqual(summary(board.slice(0, 50)))
    expect(first.rows.slice(TIE_START).map((m) => m.rank)).toEqual([48, 48, 48])
    expect(first.next).toMatchObject({ kind: 'extend', firstId: board[50].id })

    const href = new URL(showMoreHref('/leaderboard', {}, 'before', first.next!), 'http://localhost')
    const second = await getLeaderboardPage(bobClient, 'all', readRankPageParams(Object.fromEntries(href.searchParams), 'before'))
    expect(second.windowed).toBe(false)
    expect(summary(second.rows)).toEqual(summary(board))
    expect(second.rows.slice(50, 54).map((m) => m.rank)).toEqual([48, 48, 48, 54])
    expect(second.next).toBeNull()
  })

  it('ranks a fresh window that starts inside the tie against the whole board', async () => {
    const page = await getLeaderboardPage(bobClient, 'all', readRankPageParams({ before_from: encodeRankCursor(keyOf(board[50])) }, 'before'))
    expect(page.windowed).toBe(true)
    expect(summary(page.rows)).toEqual(summary(board.slice(50)))
    expect(page.rows.map((m) => m.rank)).toEqual([48, 48, 48, 54, 55, 56, 57, 58, 59, 60])
    expect(page.next).toBeNull()
  })

  it('ranks a fresh window that starts just past the tie from the members above it', async () => {
    const page = await getLeaderboardPage(bobClient, 'all', readRankPageParams({ before_from: encodeRankCursor(keyOf(board[53])) }, 'before'))
    expect(page.rows.map((m) => m.rank)).toEqual([54, 55, 56, 57, 58, 59, 60])
  })

  it('reads a window past the last member as empty, and a garbage cursor as the first page', async () => {
    const pastTheEnd: RankCursor = { score: 0, name: '', id: 'ffffffff-ffff-4fff-bfff-ffffffffffff' }
    expect(await getLeaderboardPage(bobClient, 'all', readRankPageParams({ before_from: encodeRankCursor(pastTheEnd) }, 'before'))).toEqual({
      rows: [],
      next: null,
      windowed: true,
    })

    const garbage = await getLeaderboardPage(bobClient, 'all', readRankPageParams({ before: 'garbage', before_from: '!!' }, 'before'))
    expect(garbage.windowed).toBe(false)
    expect(summary(garbage.rows)).toEqual(summary(board.slice(0, 50)))
  })

  // The board's score is a bigint, so a cursor past a JS safe integer is the only out-of-range one:
  // decodeRankCursor rejects it like any other malformed cursor, and the page falls back to the top.
  it('reads a raw cursor with a score past a safe integer as the first page, not an error', async () => {
    // ASCII-only JSON, so plain btoa (rather than rank-cursor.ts's UTF-8 path) is enough here.
    const encodeRaw = (json: string) => btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const overflow = encodeRaw(`[99999999999999999999,"A","${board[0].id}"]`)

    const page = await getLeaderboardPage(bobClient, 'all', readRankPageParams({ before_from: overflow }, 'before'))
    expect(page.windowed).toBe(false)
    expect(summary(page.rows)).toEqual(summary(board.slice(0, 50)))
  })
})
