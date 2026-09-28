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
}

export async function listMembers(supabase: DbClient): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance, role, avatar_path')
    .order('display_name', { ascending: true })

  if (error) throw error
  const rows = data ?? []

  // Members can't read profiles.email (0046); admins get it through member_emails().
  const emails = new Map<string, string>()
  for (const ids of chunk(rows.map((p) => p.id as string), IN_CHUNK)) {
    const { data: found, error: emailErr } = await supabase.rpc('member_emails', { p_ids: ids })
    if (emailErr) throw emailErr
    for (const r of (found ?? []) as { id: string; email: string }[]) emails.set(r.id, r.email)
  }

  return rows.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarSrc: avatarUrl(p.avatar_path),
    email: emails.get(p.id) ?? '',
    balance: p.balance,
    role: isRole(p.role) ? p.role : 'member',
  }))
}
