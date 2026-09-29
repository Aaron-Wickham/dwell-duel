import type { DbClient } from '@/lib/supabase/database'
import { recapWeekFor, type RecapWeek } from '@/lib/home/recap-week'

export type RecapMarket = { id: string; title: string; closeAt: string }

export type WeeklyRecap = RecapWeek & {
  // The member's own week, null when they neither bet nor earned a task reward.
  me: { betting: number; bettingMoves: number; tasks: number } | null
  bestCall: { memberName: string; marketId: string; marketTitle: string; stake: number; payout: number } | null
  upset: { marketId: string; marketTitle: string; outcomeLabel: string; chance: number } | null
  topTasker: { memberName: string; count: number } | null
  closing: { total: number; markets: RecapMarket[] }
}

// weekly_recap's row (0056).
export type RecapRow = {
  my_betting_net: number | string
  my_betting_moves: number
  my_task_income: number | string
  best_bettor_name: string | null
  best_market_id: string | null
  best_market_title: string | null
  best_stake: number | null
  best_payout: number | null
  upset_market_id: string | null
  upset_market_title: string | null
  upset_outcome_label: string | null
  upset_chance: number | null
  top_tasker_name: string | null
  top_tasker_count: number | null
  closing_total: number
  closing: unknown
}

// Null on the days Home shows no recap (anything but Sunday and Monday, Eastern), and when the
// week has nothing to say.
export async function getWeeklyRecap(supabase: DbClient, now: Date = new Date()): Promise<WeeklyRecap | null> {
  const week = recapWeekFor(now)
  if (!week) return null
  const { data, error } = await supabase.rpc('weekly_recap', { p_week: week.monday }).maybeSingle()
  if (error) throw error
  return data ? toWeeklyRecap(week, data) : null
}

export function toWeeklyRecap(week: RecapWeek, row: RecapRow): WeeklyRecap | null {
  const betting = Number(row.my_betting_net)
  const tasks = Number(row.my_task_income)
  const recap: WeeklyRecap = {
    ...week,
    me: row.my_betting_moves > 0 || tasks > 0 ? { betting, bettingMoves: row.my_betting_moves, tasks } : null,
    bestCall:
      row.best_market_id && row.best_market_title && row.best_bettor_name
        ? {
            memberName: row.best_bettor_name,
            marketId: row.best_market_id,
            marketTitle: row.best_market_title,
            stake: row.best_stake ?? 0,
            payout: row.best_payout ?? 0,
          }
        : null,
    upset:
      row.upset_market_id && row.upset_market_title && row.upset_outcome_label && row.upset_chance !== null
        ? {
            marketId: row.upset_market_id,
            marketTitle: row.upset_market_title,
            outcomeLabel: row.upset_outcome_label,
            chance: row.upset_chance,
          }
        : null,
    topTasker: row.top_tasker_name && row.top_tasker_count ? { memberName: row.top_tasker_name, count: row.top_tasker_count } : null,
    closing: { total: row.closing_total, markets: closingMarkets(row.closing) },
  }
  const hasNews = recap.me || recap.bestCall || recap.upset || recap.topTasker || recap.closing.total > 0
  return hasNews ? recap : null
}

function closingMarkets(json: unknown): RecapMarket[] {
  if (!Array.isArray(json)) return []
  return json.map((m: { id: string; title: string; close_at: string }) => ({ id: m.id, title: m.title, closeAt: m.close_at }))
}
