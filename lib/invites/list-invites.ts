import type { DbClient } from '@/lib/supabase/database'

export interface InviteRow {
  email: string
  claimed: boolean
  createdAt: string
}

export async function listInvites(supabase: DbClient): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('allowed_emails')
    .select('email, claimed_by, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    email: row.email,
    claimed: row.claimed_by !== null,
    createdAt: row.created_at,
  }))
}
