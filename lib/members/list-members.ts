import type { DbClient } from '@/lib/supabase/database'
import { avatarUrl } from '@/lib/profile/avatar'
import { isRole, type Role } from '@/lib/auth/roles'
import { readOrdered, type KeysetPage } from '@/lib/pagination/keyset'
import { NAME_ORDER, type NameCursor, type NamePageParams } from '@/lib/pagination/name-cursor'
import {
  compareByValue,
  valueOrder,
  valueOrderInMemory,
  type ValueCursor,
  type ValuePageParams,
} from '@/lib/pagination/value-cursor'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'
import { readAll } from '@/lib/supabase/read-all'

export interface MemberSummary {
  id: string
  displayName: string
  avatarSrc: string | null
  email: string
  balance: number
  role: Role
  joinedAt: string | null
  lastSignInAt: string | null
  // Their invite is gone (remove_member): they can't sign in and aren't ranked (#265).
  removed: boolean
}

export type MemberCounts = { active: number; removed: number }

// admin_members (0093) reads emails and sign-ins, which only admins may (0046, 0050). The
// generated types call last_sign_in_at non-null, but a member who has never signed in has none.
type MemberRow = {
  id: string
  display_name: string
  avatar_path: string | null
  balance: number
  role: string
  email: string
  joined_at: string
  last_sign_in_at: string | null
  removed: boolean
}

const MEMBER_COLUMNS = 'id, display_name, avatar_path, balance, role, email, joined_at, last_sign_in_at, removed'

function toSummary(row: MemberRow): MemberSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarSrc: avatarUrl(row.avatar_path),
    email: row.email,
    balance: row.balance,
    role: isRole(row.role) ? row.role : 'member',
    joinedAt: row.joined_at,
    lastSignInAt: row.last_sign_in_at,
    removed: row.removed,
  }
}

const nameKey = (row: MemberRow): NameCursor => ({ name: row.display_name, id: row.id })

// One tab of Admin › Members, A–Z, matching `query` by name or email when it isn't empty. The
// key columns are the whole row, so the probe needs no fetchKeys.
export async function listMembersPage(
  supabase: DbClient,
  options: { query: string; removed: boolean; page: NamePageParams },
): Promise<KeysetPage<MemberSummary>> {
  const result = await readOrdered(
    options.page,
    NAME_ORDER,
    async (filter, limit) => {
      let q = supabase.rpc('admin_members', { p_query: options.query }).select(MEMBER_COLUMNS).eq('removed', options.removed)
      if (filter) q = q.or(filter)
      const { data, error } = await q.order('display_name', { ascending: true }).order('id', { ascending: true }).limit(limit)
      if (error) throw error
      return data as MemberRow[]
    },
    nameKey,
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

export async function countMembers(supabase: DbClient, query: string): Promise<MemberCounts> {
  const { data, error } = await supabase.rpc('admin_member_counts', { p_query: query }).single()
  if (error) throw error
  return { active: data.active, removed: data.removed }
}

// One member for their Admin page, or null when there's no such member. `isUuid(id)` must be
// checked by the caller first: a malformed id errors here instead of matching no rows.
export async function getAdminMember(supabase: DbClient, id: string): Promise<MemberSummary | null> {
  const { data, error } = await supabase.rpc('admin_members', { p_id: id }).select(MEMBER_COLUMNS).maybeSingle()
  if (error) throw error
  return data ? toSummary(data as MemberRow) : null
}

// ─── Sorted by a figure (#418) ───────────────────────────────────────────────

export type MemberValueColumn = 'balance' | 'joined_at'

// One tab of Admin › Members sorted by balance or by when they joined, in either direction, then
// A–Z. The key columns are the whole row, so the probe needs no fetchKeys.
export async function listMembersByValue(
  supabase: DbClient,
  options: { query: string; removed: boolean; column: MemberValueColumn; ascending: boolean; page: ValuePageParams },
): Promise<KeysetPage<MemberSummary>> {
  const { column, ascending } = options
  const result = await readOrdered(
    options.page,
    valueOrder(column, ascending),
    async (filter, limit) => {
      let q = supabase.rpc('admin_members', { p_query: options.query }).select(MEMBER_COLUMNS).eq('removed', options.removed)
      if (filter) q = q.or(filter)
      const { data, error } = await q
        .order(column, { ascending })
        .order('display_name', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit)
      if (error) throw error
      return data as MemberRow[]
    },
    (row): ValueCursor => ({ value: column === 'balance' ? row.balance : row.joined_at, name: row.display_name, id: row.id }),
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

type WorthRow = { id: string; display_name: string; score: number }

const worthKey = (row: WorthRow): ValueCursor => ({ value: row.score, name: row.display_name, id: row.id })

function worthQuery(supabase: DbClient) {
  return supabase.rpc('leaderboard_net_worth').select('id, display_name, score')
}

// The Active tab sorted by net worth, with each row's net worth. It reads the net-worth board, which
// holds exactly the Active tab's members (0093) and computes every member's worth on each read
// anyway. The board can't search emails, so a search reads the matching ids and the whole board and
// sorts them here: a few rows per member, and only while an admin searches in this order.
export async function listMembersByNetWorth(
  supabase: DbClient,
  options: { query: string; ascending: boolean; page: ValuePageParams },
): Promise<KeysetPage<MemberSummary> & { netWorths: Map<string, number> }> {
  const { ascending } = options
  let result: KeysetPage<WorthRow>
  if (options.query === '') {
    result = await readOrdered(
      options.page,
      valueOrder('score', ascending),
      async (filter, limit) => {
        let q = worthQuery(supabase)
        if (filter) q = q.or(filter)
        const { data, error } = await q
          .order('score', { ascending })
          .order('display_name', { ascending: true })
          .order('id', { ascending: true })
          .limit(limit)
        if (error) throw error
        return data ?? []
      },
      worthKey,
    )
  } else {
    const [matches, board] = await Promise.all([
      readAll((from, to) =>
        supabase.rpc('admin_members', { p_query: options.query }).select('id').eq('removed', false).order('id').range(from, to),
      ),
      readAll((from, to) => worthQuery(supabase).order('id').range(from, to)),
    ])
    const matching = new Set(matches.map((m) => m.id))
    const compare = compareByValue(ascending)
    const sorted = board.filter((row) => matching.has(row.id)).sort((a, b) => compare(worthKey(a), worthKey(b)))
    result = await readOrdered(
      options.page,
      valueOrderInMemory(ascending),
      async (keep, limit) => (keep ? sorted.filter((row) => keep(worthKey(row))) : sorted).slice(0, limit),
      worthKey,
    )
  }

  // The rest of each row, in the board's order. A member gone between the two reads is left out.
  const details = new Map<string, MemberSummary>()
  const parts = await Promise.all(
    chunk(
      result.rows.map((row) => row.id),
      IN_CHUNK,
    ).map((ids) => supabase.rpc('admin_members', {}).select(MEMBER_COLUMNS).in('id', ids)),
  )
  for (const { data, error } of parts) {
    if (error) throw error
    for (const row of data as MemberRow[]) details.set(row.id, toSummary(row))
  }
  return {
    ...result,
    rows: result.rows.flatMap((row) => details.get(row.id) ?? []),
    netWorths: new Map(result.rows.map((row) => [row.id, row.score])),
  }
}

// Every member's id and name, A–Z, removed or not, for Admin › Ledger's member filter (#418).
export async function listMemberNames(supabase: DbClient): Promise<{ id: string; name: string }[]> {
  const rows = await readAll((from, to) =>
    supabase.from('profiles').select('id, display_name').order('display_name').order('id').range(from, to),
  )
  return rows.map((row) => ({ id: row.id, name: row.display_name }))
}
