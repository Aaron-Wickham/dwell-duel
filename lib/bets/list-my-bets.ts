import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'

export type MyBetResult =
  | { kind: 'open' }
  | { kind: 'awaiting' }
  | { kind: 'won'; payout: number }
  | { kind: 'lost' }
  | { kind: 'refunded' }

export interface MyBet {
  id: number
  marketId: string
  marketTitle: string
  outcomeLabel: string
  amount: number
  placedAt: string
  closeAt: string
  result: MyBetResult
}

export interface MyCancelledBet {
  id: number
  marketId: string
  marketTitle: string
  outcomeLabel: string
  amount: number
  cancelledAt: string
}

interface MarketEmbed {
  id: string
  title: string
  status: 'open' | 'resolved' | 'voided'
  close_at: string
  current_resolution: { outcome_id: string } | null
  market_outcomes: { id: string; pool_total: number }[]
}

interface BetRow {
  id: number
  outcome_id: string
  amount: number
  created_at: string
  market_outcomes: { label: string } | null
  markets: MarketEmbed
}

// A winning pool can't be empty when this bet is in it, so the division is safe. Same arithmetic as
// resolve_market, from pools that can't move once a market resolves.
export function betResult(bet: { outcomeId: string; amount: number }, market: MarketEmbed, now: number): MyBetResult {
  if (market.status === 'voided') return { kind: 'refunded' }
  if (market.status === 'open') return Date.parse(market.close_at) > now ? { kind: 'open' } : { kind: 'awaiting' }
  const winner = market.current_resolution?.outcome_id
  if (winner !== bet.outcomeId) return { kind: 'lost' }
  const total = market.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0)
  const winningPool = market.market_outcomes.find((o) => o.id === winner)?.pool_total ?? bet.amount
  return { kind: 'won', payout: Math.floor((bet.amount * total) / winningPool) }
}

const BET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }
const BET_COLUMNS =
  'id, outcome_id, amount, created_at, market_outcomes(label), markets!inner(id, title, status, close_at, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id), market_outcomes(id, pool_total))'
const betKey = (b: { id: number; created_at: string }): Cursor => ({ ts: b.created_at, id: String(b.id) })

export type BetSection = 'open' | 'settled'
const SECTION_STATUSES: Record<BetSection, string[]> = { open: ['open'], settled: ['resolved', 'voided'] }

// The range read and its key probe share one builder, so the two can't drift apart on filters. The
// key probe still needs the markets!inner embed, since that's what the status filter narrows on.
function myBetsQuery(
  supabase: SupabaseClient,
  userId: string,
  section: BetSection,
  columns: string,
  filter: string | null,
  limit: number,
) {
  let query = supabase
    .from('bets')
    .select(columns)
    .eq('profile_id', userId)
    .in('markets.status', SECTION_STATUSES[section])
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function listMyBets(
  supabase: SupabaseClient,
  userId: string,
  section: BetSection,
  page: PageParams,
): Promise<KeysetPage<MyBet>> {
  const result = await readKeyset(
    page,
    BET_KEYS,
    async (filter, limit) => {
      const { data, error } = await myBetsQuery(supabase, userId, section, BET_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as BetRow[]
    },
    betKey,
    async (filter, limit) => {
      const { data, error } = await myBetsQuery(supabase, userId, section, 'id, created_at, markets!inner(status)', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(betKey)
    },
  )

  const now = Date.now()
  return {
    ...result,
    rows: result.rows.map((b) => ({
      id: b.id,
      marketId: b.markets.id,
      marketTitle: b.markets.title,
      outcomeLabel: b.market_outcomes?.label ?? 'Unknown outcome',
      amount: b.amount,
      placedAt: b.created_at,
      closeAt: b.markets.close_at,
      result: betResult({ outcomeId: b.outcome_id, amount: b.amount }, b.markets, now),
    })),
  }
}

const CANCELLED_KEYS: KeyColumns = { ts: 'cancelled_at', id: 'id', isId: isBigintId }
const CANCELLED_COLUMNS = 'id, amount, cancelled_at, market_outcomes(label), markets(id, title)'

interface CancelledRow {
  id: number
  amount: number
  cancelled_at: string
  market_outcomes: { label: string } | null
  markets: { id: string; title: string } | null
}

const cancelledKey = (b: { id: number; cancelled_at: string }): Cursor => ({ ts: b.cancelled_at, id: String(b.id) })

function cancelledQuery(supabase: SupabaseClient, userId: string, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('cancelled_bets').select(columns).eq('profile_id', userId)
  if (filter) query = query.or(filter)
  return query.order('cancelled_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function listMyCancelledBets(
  supabase: SupabaseClient,
  userId: string,
  page: PageParams,
): Promise<KeysetPage<MyCancelledBet>> {
  const result = await readKeyset(
    page,
    CANCELLED_KEYS,
    async (filter, limit) => {
      const { data, error } = await cancelledQuery(supabase, userId, CANCELLED_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as CancelledRow[]
    },
    cancelledKey,
    async (filter, limit) => {
      const { data, error } = await cancelledQuery(supabase, userId, 'id, cancelled_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; cancelled_at: string }[]).map(cancelledKey)
    },
  )

  return {
    ...result,
    rows: result.rows.map((b) => ({
      id: b.id,
      marketId: b.markets?.id ?? '',
      marketTitle: b.markets?.title ?? 'Unknown market',
      outcomeLabel: b.market_outcomes?.label ?? 'Unknown outcome',
      amount: b.amount,
      cancelledAt: b.cancelled_at,
    })),
  }
}
