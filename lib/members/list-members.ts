import type { SupabaseClient } from '@supabase/supabase-js'
import { avatarUrl } from '@/lib/profile/avatar'
import { isRole, type Role } from '@/lib/auth/roles'

export interface MemberSummary {
  id: string
  displayName: string
  avatarSrc: string | null
  email: string
  balance: number
  role: Role
}

export async function listMembers(supabase: SupabaseClient): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, balance, role, avatar_path')
    .order('display_name', { ascending: true })

  if (error) throw error

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    avatarSrc: avatarUrl(p.avatar_path),
    email: p.email,
    balance: p.balance,
    role: isRole(p.role) ? p.role : 'member',
  }))
}
