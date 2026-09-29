import type { DbClient } from '@/lib/supabase/database'

export type MarketToResolve = { id: string; title: string; closeAt: string }
// `total` counts every market waiting, while `markets` holds only the first few the RPC returns.
export type MarketsToResolve = { total: number; markets: MarketToResolve[] }

// Who is nudged about which market is decided in SQL (0049), next to can_resolve_market.
export async function getMarketsToResolve(supabase: DbClient): Promise<MarketsToResolve> {
  const { data, error } = await supabase.rpc('markets_to_resolve')
  if (error) throw error
  const rows = data ?? []
  return {
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    markets: rows.map((r) => ({ id: r.id, title: r.title, closeAt: r.close_at })),
  }
}
