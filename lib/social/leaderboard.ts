import type { SupabaseClient } from '@supabase/supabase-js'
import { readOrdered, type KeysetPage } from '@/lib/pagination/keyset'
import { RANK_ORDER, aheadOfRankFilter, type RankCursor, type RankPageParams } from '@/lib/pagination/rank-cursor'
import { avatarUrl } from '@/lib/profile/avatar'
import { assignRanks, type LeaderboardEntry } from './ranking'

export type MemberStanding = LeaderboardEntry & { memberCount: number; bio: string | null }

type ProfileRow = { id: string; display_name: string; balance: number; avatar_path: string | null }

const rankKey = (p: ProfileRow): RankCursor => ({ balance: p.balance, name: p.display_name, id: p.id })

function boardQuery(supabase: SupabaseClient, filter: string | null, limit: number) {
  let query = supabase.from('profiles').select('id, display_name, balance, avatar_path')
  if (filter) query = query.or(filter)
  return query
    .order('balance', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
}

// Ranks are competition ranks over the whole board, whichever slice of it is on screen. A window
// that starts mid-board counts two things about its first row: the members with more coins, whose
// count fixes the rank of the first row's whole tie group, and every member ahead of it in the
// order, which includes the start of a tie that straddles the boundary and so fixes where the
// window's later groups rank. The key columns are the whole row, so the probe needs no fetchKeys.
export async function getLeaderboardPage(supabase: SupabaseClient, page: RankPageParams): Promise<KeysetPage<LeaderboardEntry>> {
  const result = await readOrdered(
    page,
    RANK_ORDER,
    async (filter, limit) => {
      const { data, error } = await boardQuery(supabase, filter, limit)
      if (error) throw error
      return (data ?? []) as ProfileRow[]
    },
    rankKey,
  )

  const ranked = assignRanks(result.rows.map((p) => ({ id: p.id, displayName: p.display_name, avatarSrc: avatarUrl(p.avatar_path), balance: p.balance })))
  if (!result.windowed || result.rows.length === 0) return { ...result, rows: ranked }

  const first = result.rows[0]
  // The row read and these counts are separate requests, not a snapshot, so a balance changing
  // between them can briefly show an off-by-some rank; the page's live refresh on profile changes
  // corrects it on the next read.
  const [above, ahead] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gt('balance', first.balance),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).or(aheadOfRankFilter(rankKey(first))),
  ])
  if (above.error) throw above.error
  if (ahead.error) throw ahead.error

  return {
    ...result,
    rows: ranked.map((m) => ({
      ...m,
      rank: m.balance === first.balance ? (above.count ?? 0) + 1 : (ahead.count ?? 0) + m.rank,
    })),
  }
}

// Reads one profile, then counts rather than loading every member, so the member page's cost
// doesn't grow with the membership. `isUuid(memberId)` must be checked by the caller first:
// a malformed id reaches `.eq('id', …)` here, which errors instead of matching no rows.
export async function getMemberStanding(supabase: SupabaseClient, memberId: string): Promise<MemberStanding | null> {
  const { data: member, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance, avatar_path, bio')
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
    avatarSrc: avatarUrl(member.avatar_path as string | null),
    bio: member.bio as string | null,
    balance: member.balance as number,
    rank: (above.count ?? 0) + 1,
    memberCount: everyone.count ?? 0,
  }
}
