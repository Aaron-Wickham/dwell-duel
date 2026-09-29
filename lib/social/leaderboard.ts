import type { DbClient } from '@/lib/supabase/database'
import { readOrdered, type KeysetPage } from '@/lib/pagination/keyset'
import { RANK_ORDER, type RankCursor, type RankPageParams } from '@/lib/pagination/rank-cursor'
import { avatarUrl } from '@/lib/profile/avatar'

// `all` ranks net worth, balance plus DC riding on open bets; `month` ranks this calendar
// month's net betting profit, in America/New_York.
export type Board = 'all' | 'month'

export interface LeaderboardEntry {
  id: string
  displayName: string
  avatarSrc: string | null
  score: number
  rank: number
}

export type MemberStanding = LeaderboardEntry & { balance: number; memberCount: number; bio: string | null }

type BoardRow = { id: string; display_name: string; avatar_path: string | null; score: number; rank: number }

const BOARD_FUNCTIONS = { all: 'leaderboard_net_worth', month: 'leaderboard_month' } as const

const rankKey = (r: BoardRow): RankCursor => ({ score: r.score, name: r.display_name, id: r.id })

function boardQuery(supabase: DbClient, board: Board, filter: string | null, limit: number) {
  let query = supabase.rpc(BOARD_FUNCTIONS[board]).select('id, display_name, avatar_path, score, rank')
  if (filter) query = query.or(filter)
  return query
    .order('score', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
}

// Both boards rank in SQL, over every member, before a page's filters apply, so a window that
// starts mid-board, even inside a tie, still shows each row's rank on the whole board. The key
// columns are the whole row, so the probe needs no fetchKeys.
export async function getLeaderboardPage(supabase: DbClient, board: Board, page: RankPageParams): Promise<KeysetPage<LeaderboardEntry>> {
  const result = await readOrdered(
    page,
    RANK_ORDER,
    async (filter, limit) => {
      const { data, error } = await boardQuery(supabase, board, filter, limit)
      if (error) throw error
      return (data ?? []) as BoardRow[]
    },
    rankKey,
  )
  return {
    ...result,
    rows: result.rows.map((r) => ({ id: r.id, displayName: r.display_name, avatarSrc: avatarUrl(r.avatar_path), score: r.score, rank: r.rank })),
  }
}

// The member's row on the net-worth board, so Home, the member page and the leaderboard agree.
// `isUuid(memberId)` must be checked by the caller first: a malformed id reaches `.eq('id', …)`
// here, which errors instead of matching no rows.
export async function getMemberStanding(supabase: DbClient, memberId: string): Promise<MemberStanding | null> {
  const [profile, standing, everyone] = await Promise.all([
    supabase.from('profiles').select('id, display_name, balance, avatar_path, bio').eq('id', memberId).maybeSingle(),
    supabase.rpc('leaderboard_net_worth').select('score, rank').eq('id', memberId).maybeSingle(),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ])
  if (profile.error) throw profile.error
  if (standing.error) throw standing.error
  if (everyone.error) throw everyone.error
  const member = profile.data
  if (!member || !standing.data) return null

  return {
    id: member.id,
    displayName: member.display_name,
    avatarSrc: avatarUrl(member.avatar_path),
    bio: member.bio,
    balance: member.balance,
    score: standing.data.score,
    rank: standing.data.rank,
    memberCount: everyone.count ?? 0,
  }
}
