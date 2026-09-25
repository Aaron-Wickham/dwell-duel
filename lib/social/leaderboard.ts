import type { SupabaseClient } from '@supabase/supabase-js'
import { rankMembers, type LeaderboardEntry } from './ranking'

export async function getLeaderboard(supabase: SupabaseClient): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name, balance')
  if (error) throw error

  return rankMembers((data ?? []).map((p) => ({ id: p.id, displayName: p.display_name, balance: p.balance })))
}
