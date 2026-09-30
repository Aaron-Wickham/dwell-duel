import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'

export interface AwaitingMarket {
  id: string
  title: string
  closeAt: string
  creatorId: string
  creatorName: string
  // Real stakes only: the seed is virtual, and parlays stay out of pools.
  pooled: number
}

// Oldest close first: the market that has kept its bettors waiting longest leads.
const KEYS: KeyColumns = { ts: 'close_at', id: 'id', isId: isUuid, ascending: true }

// The same set my_review_counts (0058) counts for the Admin badge: open, and past its close.
function awaitingQuery<Columns extends string>(supabase: DbClient, columns: Columns, now: string, filter: string | null, limit: number) {
  let query = supabase.from('markets').select(columns).eq('status', 'open').lte('close_at', now)
  if (filter) query = query.or(filter)
  return query.order('close_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
}

export async function listAwaitingMarkets(
  supabase: DbClient,
  page: PageParams,
  now: string,
): Promise<KeysetPage<AwaitingMarket>> {
  const keyOf = (m: { id: string; close_at: string }): Cursor => ({ ts: m.close_at, id: m.id })
  const result = await readKeyset(
    page,
    KEYS,
    async (filter, limit) => {
      const { data, error } = await awaitingQuery(
        supabase,
        'id, title, close_at, created_by, creator:profiles!markets_created_by_fkey(display_name), market_outcomes(pool_total)',
        now,
        filter,
        limit,
      )
      if (error) throw error
      return data ?? []
    },
    keyOf,
    async (filter, limit) => {
      const { data, error } = await awaitingQuery(supabase, 'id, close_at', now, filter, limit)
      if (error) throw error
      return (data ?? []).map(keyOf)
    },
  )
  return {
    ...result,
    rows: result.rows.map((m) => ({
      id: m.id,
      title: m.title,
      closeAt: m.close_at,
      creatorId: m.created_by,
      creatorName: m.creator?.display_name ?? FALLBACK_NAME,
      pooled: m.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0),
    })),
  }
}
