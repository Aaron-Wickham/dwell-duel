import type { MarketKind } from '@/lib/markets/kind'
import type { Pricing, PricedOutcome } from '@/lib/markets/pricing'
import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'
import { likePattern } from '@/lib/markets/search'
import type { MarketCategory } from '@/lib/markets/categories'

export interface MarketSummary {
  id: string
  title: string
  kind: MarketKind
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  createdAt: string
  seedPerOutcome: number
  pricing: Pricing
  liquidity: number
  line: number | null
  edited: boolean
  category: MarketCategory | null
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  // When it stopped being open (0066): the first resolution or the void; null while open.
  settledAt: string | null
  outcomes: PricedOutcome[]
  // Solo bets on it, as the market page's chart caption counts them.
  betCount: number
  // Moves whenever the card's sparkline can (#252): with every bet or cancellation while the
  // market is open (0095's pool_version), and never once it has settled.
  sparkVersion: string
}

// The resolution is embedded through the market's own current_resolution_id, not read with a
// second `.in()` whose URL would grow with the list. The hint names the foreign key because
// market_resolutions also points back at markets through market_id.
const SUMMARY_SELECT =
  'id, title, kind, status, close_at, created_at, settled_at, seed_per_outcome, pricing, liquidity, line, edited_at, category:market_categories(name, slug), current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at), market_outcomes(id, label, pool_total, pool_version, shares, q_offset), bets(count)'

type SummaryRow = {
  id: string
  title: string
  kind: MarketSummary['kind']
  status: MarketSummary['status']
  close_at: string
  created_at: string
  settled_at: string | null
  seed_per_outcome: number
  pricing: Pricing
  liquidity: number
  line: number | null
  edited_at: string | null
  category: MarketCategory | null
  current_resolution: { outcome_id: string; resolved_at: string } | null
  market_outcomes: { id: string; label: string; pool_total: number; pool_version: number; shares: number; q_offset: number }[] | null
  bets: { count: number }[] | null
}

function sparkVersion(m: SummaryRow): string {
  if (m.status !== 'open') return 'settled'
  return String((m.market_outcomes ?? []).reduce((sum, o) => sum + o.pool_version, 0))
}

function toSummary(m: SummaryRow): MarketSummary {
  const outcomes = (m.market_outcomes ?? []).map((o) => ({
    id: o.id,
    label: o.label,
    poolTotal: o.pool_total,
    shares: Number(o.shares),
    qOffset: Number(o.q_offset),
  }))
  const resolution = m.current_resolution
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    closeAt: m.close_at,
    createdAt: m.created_at,
    seedPerOutcome: m.seed_per_outcome,
    pricing: m.pricing,
    liquidity: Number(m.liquidity),
    line: m.line,
    edited: m.edited_at !== null,
    category: m.category,
    resolvedOutcomeLabel: resolution ? (outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null,
    resolvedAt: resolution?.resolved_at ?? null,
    settledAt: m.settled_at,
    outcomes,
    betCount: m.bets?.[0]?.count ?? 0,
    sparkVersion: sparkVersion(m),
  }
}

// Open markets list soonest to close first, so one closing within the hour isn't buried under
// newer ones; resolved and voided markets list newest settled first (0066's settled_at, which
// every resolved or voided market has).
type MarketKeys = KeyColumns & { ts: 'close_at' | 'settled_at' | 'created_at' }
const OPEN_KEYS: MarketKeys = { ts: 'close_at', id: 'id', isId: isUuid, ascending: true }
const RESOLVED_KEYS: MarketKeys = { ts: 'settled_at', id: 'id', isId: isUuid }

// A key probe selects only the id and the list's own timestamp column. settled_at is null only
// while a market is open, which the resolved list never reads.
type KeyRow = { id: string } & Partial<Record<MarketKeys['ts'], string | null>>

// Open markets split at their close time: still taking bets, or past it and waiting on a resolver.
export type CloseBound = { upcoming: boolean; at: string }

// A title search and a category, ANDed onto the list. A category alone keeps the grouped lists;
// only a search makes the flat list.
export type MarketNarrow = { q?: string; categoryId?: string | null }

// The range read and its key probe share one builder, so the two can't drift apart on filters. Its column list is a runtime string, so
// the generated types can't follow it, and each reader casts its rows.
function marketsQuery(
  supabase: DbClient,
  statuses: MarketSummary['status'][],
  keys: KeyColumns,
  columns: string,
  filter: string | null,
  limit: number,
  bound?: CloseBound,
  narrow?: MarketNarrow,
) {
  let query = supabase.from('markets').select(columns).in('status', statuses)
  if (narrow?.q) query = query.ilike('title', likePattern(narrow.q))
  if (narrow?.categoryId) query = query.eq('category_id', narrow.categoryId)
  // A plain bound ANDed onto the cursor's OR, as the keyset filters do, keeps the Index Cond.
  if (bound) query = bound.upcoming ? query.gt('close_at', bound.at) : query.lte('close_at', bound.at)
  if (filter) query = query.or(filter)
  const ascending = keys.ascending ?? false
  return query.order(keys.ts, { ascending }).order(keys.id, { ascending }).limit(limit)
}

async function listMarkets(
  supabase: DbClient,
  statuses: MarketSummary['status'][],
  keys: MarketKeys,
  page: PageParams,
  bound?: CloseBound,
  narrow?: MarketNarrow,
): Promise<KeysetPage<MarketSummary>> {
  const keyOf = (m: KeyRow): Cursor => ({ ts: m[keys.ts] as string, id: m.id })
  const result = await readKeyset(
    page,
    keys,
    async (filter, limit) => {
      const { data, error } = await marketsQuery(supabase, statuses, keys, SUMMARY_SELECT, filter, limit, bound, narrow)
        // The order the creator typed them in (0110), as getMarket reads them, so a card's
        // outcomes (and their colours) match the market page's.
        .order('position', { referencedTable: 'market_outcomes' })
      if (error) throw error
      return (data ?? []) as unknown as SummaryRow[]
    },
    keyOf,
    async (filter, limit) => {
      const { data, error } = await marketsQuery(supabase, statuses, keys, `id, ${keys.ts}`, filter, limit, bound, narrow)
      if (error) throw error
      return ((data ?? []) as unknown as KeyRow[]).map(keyOf)
    },
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

// Open markets include those past their close time and awaiting resolution, which come first in
// this order, so the page always passes a bound and reads each side as its own list (#261).
export async function listOpenMarkets(
  supabase: DbClient,
  page: PageParams,
  bound?: CloseBound,
  narrow?: MarketNarrow,
): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['open'], OPEN_KEYS, page, bound, narrow)
}

// Resolved and voided markets are one list, one "Show more", shown in their two groups.
export async function listResolvedMarkets(
  supabase: DbClient,
  page: PageParams,
  narrow?: MarketNarrow,
): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['resolved', 'voided'], RESOLVED_KEYS, page, undefined, narrow)
}

// A search lists matches as one flat list, newest first, in every status: the open and resolved
// lists order by different columns, and a person looking for one market doesn't want it split
// into sections, or hidden behind a tab they didn't think to check.
const MATCH_KEYS: MarketKeys = { ts: 'created_at', id: 'id', isId: isUuid }

export async function listMatchingMarkets(
  supabase: DbClient,
  page: PageParams,
  narrow: MarketNarrow,
): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['open', 'resolved', 'voided'], MATCH_KEYS, page, undefined, narrow)
}

// Only markets still taking bets (#261): one past its close is waiting on a result.
export async function countOpenMarkets(supabase: DbClient, now: Date = new Date()): Promise<number> {
  const { count, error } = await supabase
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .gt('close_at', now.toISOString())
  if (error) throw error
  return count ?? 0
}
