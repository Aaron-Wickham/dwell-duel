import type { SupabaseClient } from '@supabase/supabase-js'
import type { PageParams } from '@/lib/pagination/cursor'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'

export interface MarketSummary {
  id: string
  title: string
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

// The resolution is embedded through the market's own current_resolution_id, not read with a
// second `.in()` whose URL would grow with the list. The hint names the foreign key because
// market_resolutions also points back at markets through market_id.
const SUMMARY_SELECT =
  'id, title, kind, status, close_at, created_at, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at), market_outcomes(id, label, pool_total)'

type SummaryRow = {
  id: string
  title: string
  kind: MarketSummary['kind']
  status: MarketSummary['status']
  close_at: string
  created_at: string
  current_resolution: { outcome_id: string; resolved_at: string } | null
  market_outcomes: { id: string; label: string; pool_total: number }[] | null
}

function toSummary(m: SummaryRow): MarketSummary {
  const outcomes = (m.market_outcomes ?? []).map((o) => ({ id: o.id, label: o.label, poolTotal: o.pool_total }))
  const resolution = m.current_resolution
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    closeAt: m.close_at,
    resolvedOutcomeLabel: resolution ? (outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null,
    resolvedAt: resolution?.resolved_at ?? null,
    outcomes,
  }
}

export async function listOpenMarkets(supabase: SupabaseClient): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('markets')
    .select(SUMMARY_SELECT)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // Same tiebreak as getMarket: insertion time, then label, so outcome order (and
    // therefore colour assignment) is stable across requests.
    .order('created_at', { referencedTable: 'market_outcomes' })
    .order('label', { referencedTable: 'market_outcomes' })

  if (error) throw error
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary)
}

const MARKET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isUuid }

// Resolved and voided markets are one list, one "Show more", shown in their two groups.
export async function listClosedMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  const result = await readKeyset(
    page,
    MARKET_KEYS,
    async (filter, limit) => {
      let query = supabase.from('markets').select(SUMMARY_SELECT).in('status', ['resolved', 'voided'])
      if (filter) query = query.or(filter)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .order('created_at', { referencedTable: 'market_outcomes' })
        .order('label', { referencedTable: 'market_outcomes' })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as SummaryRow[]
    },
    (m) => ({ ts: m.created_at, id: m.id }),
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

export async function countOpenMarkets(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (error) throw error
  return count ?? 0
}
