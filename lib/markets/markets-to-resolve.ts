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

// Mirrors markets_to_resolve's wait before reviewers and admins are nudged (0049).
const REVIEWER_WAIT_MS = 48 * 60 * 60 * 1000

// A market closing is only the clock passing, so no database change tells Home. This is the next
// moment markets_to_resolve could gain a market for this viewer, for Home to refresh at: a
// creator's own market at its close; for reviewers and admins, any open market at its close (its
// creator may hold a stake) or 48 hours after. Erring early costs one refresh that finds nothing.
export async function nextResolveCheckAt(
  supabase: DbClient,
  userId: string,
  reviewer: boolean,
  now: number = Date.now(),
): Promise<string | null> {
  const soonestCloseAfter = async (after: number, createdBy: string | null): Promise<number | null> => {
    let query = supabase.from('markets').select('close_at').eq('status', 'open').gt('close_at', new Date(after).toISOString())
    if (createdBy) query = query.eq('created_by', createdBy)
    const { data, error } = await query.order('close_at', { ascending: true }).limit(1)
    if (error) throw error
    const closeAt = data?.[0]?.close_at
    return closeAt ? Date.parse(closeAt) : null
  }

  const times = reviewer
    ? await Promise.all([
        soonestCloseAfter(now, null),
        soonestCloseAfter(now - REVIEWER_WAIT_MS, null).then((t) => (t === null ? null : t + REVIEWER_WAIT_MS)),
      ])
    : [await soonestCloseAfter(now, userId)]
  const due = times.filter((t): t is number => t !== null)
  return due.length > 0 ? new Date(Math.min(...due)).toISOString() : null
}
