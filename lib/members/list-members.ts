import type { SupabaseClient } from '@supabase/supabase-js'

export interface MemberSummary {
  id: string
  displayName: string
  email: string
  balance: number
  isAdmin: boolean
}

export async function listMembers(supabase: SupabaseClient): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, balance, is_admin')
    .order('display_name', { ascending: true })

  if (error) throw error

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    email: p.email,
    balance: p.balance,
    isAdmin: p.is_admin,
  }))
}
