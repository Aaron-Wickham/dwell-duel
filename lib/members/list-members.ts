import type { DbClient } from '@/lib/supabase/database'
import { avatarUrl } from '@/lib/profile/avatar'
import { isRole, type Role } from '@/lib/auth/roles'
import { readOrdered, type KeysetPage } from '@/lib/pagination/keyset'
import { NAME_ORDER, type NameCursor, type NamePageParams } from '@/lib/pagination/name-cursor'

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
