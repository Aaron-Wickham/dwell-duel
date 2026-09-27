import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartBet } from '@/lib/markets/probability-series'
import { WINDOW_CAP, type Cursor } from '@/lib/pagination/cursor'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'
import { newerThanFilter, type KeyColumns } from '@/lib/pagination/keyset'

// A chart needs every bet, oldest first. It reads them in keyset pages of 500, under PostgREST's
// silent 1,000-row cap (max_rows, supabase/config.toml), each page starting after the last row of
// the one before, so a bet placed mid-read can't shift a page the way an offset would.
const CHART_PAGE = WINDOW_CAP
const BET_KEYS: KeyColumns = { ts: 'created_at', id: 'id' }

type BetRow = { id: number; market_id: string; outcome_id: string; amount: number; created_at: string }

async function readBets(supabase: SupabaseClient, marketIds: string[]): Promise<BetRow[]> {
  const rows: BetRow[] = []
  let after: Cursor | null = null
  for (;;) {
    let query = supabase.from('bets').select('id, market_id, outcome_id, amount, created_at').in('market_id', marketIds)
    if (after) query = query.or(newerThanFilter(BET_KEYS, after))
    const { data, error } = await query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(CHART_PAGE)
    if (error) throw error
    const page = (data ?? []) as BetRow[]
    rows.push(...page)
    if (page.length < CHART_PAGE) return rows
    const last = page[page.length - 1]
    after = { ts: last.created_at, id: String(last.id) }
  }
}

function toChartBet(row: BetRow): ChartBet {
  return { outcomeId: row.outcome_id, amount: row.amount, createdAt: row.created_at }
}

export async function getChartBets(supabase: SupabaseClient, marketId: string): Promise<ChartBet[]> {
  return (await readBets(supabase, [marketId])).map(toChartBet)
}

// Market ids go in chunks of IN_CHUNK, so the `.in()` URL stays the same length however many
// cards the page shows.
export async function listChartBets(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>> {
  const byMarket = new Map<string, ChartBet[]>()
  if (marketIds.length === 0) return byMarket
  for (const id of marketIds) byMarket.set(id, [])
  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => readBets(supabase, part)))
  for (const row of chunks.flat()) byMarket.get(row.market_id)?.push(toChartBet(row))
  return byMarket
}

// Charts are decoration on /markets: if their read fails, the cards still render without them.
export async function readCharts(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>> {
  try {
    return await listChartBets(supabase, marketIds)
  } catch (error) {
    console.error('Market charts failed to load', error)
    return new Map()
  }
}
