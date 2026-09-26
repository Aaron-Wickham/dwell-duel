import type { SupabaseClient } from '@supabase/supabase-js'
import { assignRanks, type LeaderboardEntry } from './ranking'

export type MemberStanding = LeaderboardEntry & { memberCount: number }

// The board is sorted in the query, so ranking is one pass over rows already in order. It is
// still unbounded: a few hundred members fit the 10x target without paging.
export async function getLeaderboard(supabase: SupabaseClient): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance')
    .order('balance', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error

  return assignRanks(
    (data ?? []).map((p) => ({ id: p.id as string, displayName: p.display_name as string, balance: p.balance as number })),
  )
}

// Reads one profile, then counts rather than loading every member, so the member page's cost
// doesn't grow with the membership. `isUuid(memberId)` must be checked by the caller first:
// a malformed id reaches `.eq('id', …)` here, which errors instead of matching no rows.
export async function getMemberStanding(supabase: SupabaseClient, memberId: string): Promise<MemberStanding | null> {
  const { data: member, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance')
    .eq('id', memberId)
    .maybeSingle()
  if (error) throw error
  if (!member) return null

  const [above, everyone] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gt('balance', member.balance),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])
  if (above.error) throw above.error
  if (everyone.error) throw everyone.error

  return {
    id: member.id as string,
    displayName: member.display_name as string,
    balance: member.balance as number,
    rank: (above.count ?? 0) + 1,
    memberCount: everyone.count ?? 0,
  }
}
