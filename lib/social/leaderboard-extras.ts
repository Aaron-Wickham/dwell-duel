import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { avatarUrl } from '@/lib/profile/avatar'
import { seasonOfEventId } from './season'

export interface RaceSeries {
  id: string
  name: string
  // Cumulative net betting profit at the end of each day since the month began, oldest first.
  points: { day: string; profit: number }[]
  final: number
}

// The top members' month so far, best first. leaderboard_race (0059) draws every member's line
// edge to edge, so the series are the same length.
export async function getRace(supabase: DbClient, top = 5): Promise<RaceSeries[]> {
  const { data, error } = await supabase.rpc('leaderboard_race', { p_top: top })
  if (error) throw error
  const byMember = new Map<string, RaceSeries>()
  for (const row of data ?? []) {
    const series = byMember.get(row.profile_id) ?? { id: row.profile_id, name: row.display_name, points: [], final: 0 }
    series.points.push({ day: row.day, profit: Number(row.profit) })
    series.final = Number(row.profit)
    byMember.set(row.profile_id, series)
  }
  return [...byMember.values()].sort((a, b) => b.final - a.final || a.name.localeCompare(b.name))
}

export type AwardKind = 'biggest_win' | 'best_parlay' | 'sharpshooter' | 'most_active'

export interface Award {
  kind: AwardKind
  memberId: string
  name: string
  avatarSrc: string | null
  value: number
  detail: string | null
}

const AWARD_ORDER: AwardKind[] = ['biggest_win', 'best_parlay', 'sharpshooter', 'most_active']

// This month's awards, in a fixed order, leaving out any nobody earned yet.
export async function getAwards(supabase: DbClient): Promise<Award[]> {
  const { data, error } = await supabase.rpc('leaderboard_awards')
  if (error) throw error
  const awards = (data ?? []).map(
    (row): Award => ({
      kind: row.kind as AwardKind, // a fixed set inside leaderboard_awards
      memberId: row.profile_id,
      name: row.display_name,
      avatarSrc: avatarUrl(row.avatar_path),
      value: Number(row.value),
      detail: row.detail,
    }),
  )
  return awards.sort((a, b) => AWARD_ORDER.indexOf(a.kind) - AWARD_ORDER.indexOf(b.kind))
}

export type MemberRecord = { won: number; lost: number }

// All-time settled wins and losses for the members on a page of the board.
export async function getRecords(supabase: DbClient, ids: string[]): Promise<Map<string, MemberRecord>> {
  const records = new Map<string, MemberRecord>()
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase.rpc('member_records', { p_ids: part })
    if (error) throw error
    for (const row of data ?? []) records.set(row.profile_id, { won: row.won, lost: row.lost })
  }
  return records
}

export interface PastChampion {
  season: string
  memberId: string
  name: string
  profit: number
}

// The months settle_season has crowned, newest first. The event's id names the month.
export async function getPastChampions(supabase: DbClient, limit = 6): Promise<PastChampion[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select('id, actor_id, amount, actor:profiles!activity_events_actor_id_fkey!inner(display_name)')
    .eq('kind', 'season_champion')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).flatMap((row) => {
    const season = seasonOfEventId(row.id)
    if (!season) return []
    return [{ season, memberId: row.actor_id, name: row.actor?.display_name ?? '', profit: row.amount ?? 0 }]
  })
}
