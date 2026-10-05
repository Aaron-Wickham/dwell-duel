import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'

// Net worth (balance plus DC riding) for a page of members, for Admin › Members' table (#399).
// member_net_worths (0111) reads current and removed members alike, which the net-worth board
// can't: it leaves removed members out (0093). It takes at most IN_CHUNK ids a call.
export async function readNetWorths(supabase: DbClient, ids: readonly string[]): Promise<Map<string, number>> {
  const worth = new Map<string, number>()
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase.rpc('member_net_worths', { p_ids: part })
    if (error) throw error
    for (const row of data ?? []) worth.set(row.id, row.score)
  }
  return worth
}
