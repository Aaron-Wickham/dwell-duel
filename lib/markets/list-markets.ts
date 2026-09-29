import type { MarketKind } from '@/lib/markets/kind'
import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'

export interface MarketSummary {
  id: string
  title: string
  kind: MarketKind
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  seedPerOutcome: number
  line: number | null
  edited: boolean
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

// The resolution is embedded through the market's own current_resolution_id, not read with a
// second `.in()` whose URL would grow with the list. The hint names the foreign key because
// market_resolutions also points back at markets through market_id.
const SUMMARY_SELECT =
  'id, title, kind, status, close_at, created_at, seed_per_outcome, line, edited_at, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at), market_outcomes(id, label, pool_total)'

type SummaryRow = {
  id: string
  title: string
  kind: MarketSummary['kind']
  status: MarketSummary['status']
  close_at: string
  created_at: string
  seed_per_outcome: number
  line: number | null
  edited_at: string | null
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
    seedPerOutcome: m.seed_per_outcome,
    line: m.line,
    edited: m.edited_at !== null,
    resolvedOutcomeLabel: resolution ? (outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null,
    resolvedAt: resolution?.resolved_at ?? null,
    outcomes,
  }
}

// Open markets list soonest to close first, so one closing within the hour isn't buried under
// newer ones; resolved and voided markets list newest first.
type MarketKeys = KeyColumns & { ts: 'close_at' | 'created_at' }
const OPEN_KEYS: MarketKeys = { ts: 'close_at', id: 'id', isId: isUuid, ascending: true }
const CLOSED_KEYS: MarketKeys = { ts: 'created_at', id: 'id', isId: isUuid }

// A key probe selects only the id and the list's own timestamp column.
type KeyRow = { id: string } & Partial<Record<MarketKeys['ts'], string>>

// The range read and its key probe share one builder, so the two can't drift apart on filters. Its column list is a runtime string, so
// the generated types can't follow it, and each reader casts its rows.
function marketsQuery(
  supabase: DbClient,
  statuses: MarketSummary['status'][],
  keys: KeyColumns,
  columns: string,
  filter: string | null,
  limit: number,
) {
  let query = supabase.from('markets').select(columns).in('status', statuses)
  if (filter) query = query.or(filter)
  const ascending = keys.ascending ?? false
  return query.order(keys.ts, { ascending }).order(keys.id, { ascending }).limit(limit)
}

async function listMarkets(
  supabase: DbClient,
  statuses: MarketSummary['status'][],
  keys: MarketKeys,
  page: PageParams,
): Promise<KeysetPage<MarketSummary>> {
  const keyOf = (m: KeyRow): Cursor => ({ ts: m[keys.ts] as string, id: m.id })
  const result = await readKeyset(
    page,
    keys,
    async (filter, limit) => {
      const { data, error } = await marketsQuery(supabase, statuses, keys, SUMMARY_SELECT, filter, limit)
        // Same tiebreak as getMarket: insertion time, then label, so outcome order (and
        // therefore colour assignment) is stable across requests.
        .order('created_at', { referencedTable: 'market_outcomes' })
        .order('label', { referencedTable: 'market_outcomes' })
      if (error) throw error
      return (data ?? []) as unknown as SummaryRow[]
    },
    keyOf,
    async (filter, limit) => {
      const { data, error } = await marketsQuery(supabase, statuses, keys, `id, ${keys.ts}`, filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as KeyRow[]).map(keyOf)
    },
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

// Open markets include those past their close time and awaiting resolution, which come first in
// this order; the page splits them into their own group.
export async function listOpenMarkets(supabase: DbClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['open'], OPEN_KEYS, page)
}

// Resolved and voided markets are one list, one "Show more", shown in their two groups.
export async function listClosedMarkets(supabase: DbClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['resolved', 'voided'], CLOSED_KEYS, page)
}

export async function countOpenMarkets(supabase: DbClient): Promise<number> {
  const { count, error } = await supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (error) throw error
  return count ?? 0
}
