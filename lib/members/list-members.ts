import type { DbClient } from '@/lib/supabase/database'
import { avatarUrl } from '@/lib/profile/avatar'
import { isRole, type Role } from '@/lib/auth/roles'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'

export interface MemberSummary {
  id: string
  displayName: string
  avatarSrc: string | null
  email: string
  balance: number
  role: Role
  joinedAt: string | null
  lastSignInAt: string | null
}

// The generated types call last_sign_in_at non-null, but a member who has never signed in has none.
interface MemberActivityRow {
  id: string
  joined_at: string
  last_sign_in_at: string | null
}

export async function listMembers(supabase: DbClient): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance, role, avatar_path')
    .order('display_name', { ascending: true })

  if (error) throw error
  const rows = data ?? []

  // Members can't read profiles.email (0046); admins get it through member_emails().
  // Sign-ins live in auth.users, which only member_activity() (0050, admin only) reads.
  const emails = new Map<string, string>()
  const activity = new Map<string, MemberActivityRow>()
  for (const ids of chunk(rows.map((p) => p.id as string), IN_CHUNK)) {
    const [emailRes, activityRes] = await Promise.all([
      supabase.rpc('member_emails', { p_ids: ids }),
      supabase.rpc('member_activity', { p_ids: ids }),
    ])
    if (emailRes.error) throw emailRes.error
    if (activityRes.error) throw activityRes.error
    for (const r of (emailRes.data ?? []) as { id: string; email: string }[]) emails.set(r.id, r.email)
    for (const r of (activityRes.data ?? []) as MemberActivityRow[]) activity.set(r.id, r)
  }

  return rows.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarSrc: avatarUrl(p.avatar_path),
    email: emails.get(p.id) ?? '',
    balance: p.balance,
    role: isRole(p.role) ? p.role : 'member',
    joinedAt: activity.get(p.id)?.joined_at ?? null,
    lastSignInAt: activity.get(p.id)?.last_sign_in_at ?? null,
  }))
}
