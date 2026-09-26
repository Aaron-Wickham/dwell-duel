import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartBet } from '@/lib/markets/probability-series'

// PostgREST caps every response at max_rows (1000, supabase/config.toml) without an error, and
// a truncated oldest-first list would drop the newest bets, so read in pages of that size.
const PAGE_SIZE = 1000

type BetRow = { market_id: string; outcome_id: string; amount: number; created_at: string }

async function readBets(supabase: SupabaseClient, marketIds: string[]): Promise<BetRow[]> {
  const rows: BetRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('bets')
      .select('market_id, outcome_id, amount, created_at')
      .in('market_id', marketIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) return rows
  }
}

function toChartBet(row: BetRow): ChartBet {
  return { outcomeId: row.outcome_id, amount: row.amount, createdAt: row.created_at }
}

export async function getChartBets(supabase: SupabaseClient, marketId: string): Promise<ChartBet[]> {
  return (await readBets(supabase, [marketId])).map(toChartBet)
}

export async function listChartBets(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>> {
  const byMarket = new Map<string, ChartBet[]>()
  if (marketIds.length === 0) return byMarket
  for (const id of marketIds) byMarket.set(id, [])
  for (const row of await readBets(supabase, marketIds)) byMarket.get(row.market_id)?.push(toChartBet(row))
  return byMarket
}
