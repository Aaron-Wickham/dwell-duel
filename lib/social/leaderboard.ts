import type { DbClient } from '@/lib/supabase/database'
import { readOrdered, type KeysetPage } from '@/lib/pagination/keyset'
import { RANK_ORDER, rankedAbove, type RankCursor, type RankPageParams } from '@/lib/pagination/rank-cursor'
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

// How many members "Jump to me" shows above the member's own row, so the row has neighbours.
export const JUMP_CONTEXT = 10

// Where a window that puts the member JUMP_CONTEXT rows from its top starts, for `?at=me`: a
// RankCursor to read from (the `top` of a RankPageParams). Null when the member isn't on the board
// or has fewer than that many above them, which means they're in the first page already.
export async function getJumpToMeTop(supabase: DbClient, board: Board, memberId: string): Promise<RankCursor | null> {
  const fn = BOARD_FUNCTIONS[board]
  const me = await supabase.rpc(fn).select('id, display_name, score').eq('id', memberId).maybeSingle()
  if (me.error) throw me.error
  if (!me.data) return null
  const above = await supabase
    .rpc(fn)
    .select('id, display_name, score')
    .or(rankedAbove({ score: me.data.score, name: me.data.display_name, id: me.data.id }))
    // Nearest first, so the last of JUMP_CONTEXT rows is the one the window starts on.
    .order('score', { ascending: true })
    .order('display_name', { ascending: false })
    .order('id', { ascending: false })
    .limit(JUMP_CONTEXT)
  if (above.error) throw above.error
  const rows = above.data ?? []
  if (rows.length < JUMP_CONTEXT) return null
  const top = rows[rows.length - 1]
  return { score: top.score, name: top.display_name, id: top.id }
}

// The member's row on the net-worth board, so Home, the member page and the leaderboard agree.
// member_standing (0071) computes just that row and the board's size, instead of ranking and
// returning the whole board to pick one from (#210). `isUuid(memberId)` must be checked by the
// caller first: a malformed id errors here instead of matching no rows.
export async function getMemberStanding(supabase: DbClient, memberId: string): Promise<MemberStanding | null> {
  const [profile, standing] = await Promise.all([
    supabase.from('profiles').select('id, display_name, balance, avatar_path, bio').eq('id', memberId).maybeSingle(),
    supabase.rpc('member_standing', { p_profile_id: memberId }).maybeSingle(),
  ])
  if (profile.error) throw profile.error
  if (standing.error) throw standing.error
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
    memberCount: standing.data.member_count,
  }
}

export type YourStanding = {
  rank: number
  memberCount: number
  score: number
  // Others sharing this rank, so a tie reads as one.
  tiedWith: number
  // The nearest member with a higher net worth; null for first place.
  above: { name: string; gap: number } | null
}

// The signed-in member's place on the net-worth board, for the desktop side card. The member
// above is the nearest higher score, read with one limited query rather than from the page's
// rows, which may be a window part-way down the board.
export async function getYourStanding(supabase: DbClient, memberId: string): Promise<YourStanding | null> {
  const standing = await supabase.rpc('member_standing', { p_profile_id: memberId }).maybeSingle()
  if (standing.error) throw standing.error
  if (!standing.data) return null
  const { rank, score, member_count: memberCount } = standing.data

  const [sharing, higher] = await Promise.all([
    supabase.rpc('leaderboard_net_worth').select('id').eq('rank', rank).limit(2),
    rank > 1
      ? supabase
          .rpc('leaderboard_net_worth')
          .select('display_name, score')
          .gt('score', score)
          .order('score', { ascending: true })
          .order('display_name', { ascending: true })
          .limit(1)
      : null,
  ])
  if (sharing.error) throw sharing.error
  if (higher?.error) throw higher.error
  const nearest = higher?.data?.[0]
  return {
    rank,
    memberCount,
    score,
    tiedWith: Math.max(0, (sharing.data?.length ?? 0) - 1),
    above: nearest ? { name: nearest.display_name, gap: nearest.score - score } : null,
  }
}
