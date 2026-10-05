import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'

// Net worth (balance plus DC riding) for a page of members, for Admin › Members' table (#399).
// It's read off the net-worth board, which leaves removed members out (0093), so each of those
// falls back to member_standing, which still gives their net worth. A page holds few of them.
export async function readNetWorths(supabase: DbClient, ids: readonly string[]): Promise<Map<string, number>> {
  const worth = new Map<string, number>()
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase.rpc('leaderboard_net_worth').select('id, score').in('id', part)
    if (error) throw error
    for (const row of data ?? []) worth.set(row.id, row.score)
  }
  const missing = ids.filter((id) => !worth.has(id))
  const standings = await Promise.all(
    missing.map(async (id) => {
      const { data, error } = await supabase.rpc('member_standing', { p_profile_id: id }).maybeSingle()
      if (error) throw error
      return [id, data?.score] as const
    }),
  )
  for (const [id, score] of standings) if (score !== undefined) worth.set(id, score)
  return worth
}
