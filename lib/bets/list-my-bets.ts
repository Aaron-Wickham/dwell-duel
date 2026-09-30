import type { DbClient } from '@/lib/supabase/database'
import { effectivePools } from '@/lib/markets/odds'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'

export type MyBetResult =
  | { kind: 'open' }
  | { kind: 'awaiting' }
  | { kind: 'won'; payout: number }
  | { kind: 'lost' }
  // A void refunds everyone; so does a resolution nobody backed (resolve_market_core, 0046).
  | { kind: 'refunded'; reason: 'voided' | 'no_winners' }

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
  seed_per_outcome: number
  current_resolution: { outcome_id: string; opposing_stake: number | null } | null
  market_outcomes: { id: string; pool_total: number }[]
}

export interface BetRow {
  id: number
  outcome_id: string
  amount: number
  created_at: string
  market_outcomes: { label: string } | null
  markets: MarketEmbed
}

// The same arithmetic as resolve_market_core, from pools that can't move once a market resolves:
// the seeded payout (0041), limited to the real pool plus the resolution's opposing stake (0074; a
// resolution before then has none and paid the seeded payout).
export function betResult(bet: { outcomeId: string; amount: number }, market: MarketEmbed, now: number): MyBetResult {
  if (market.status === 'voided') return { kind: 'refunded', reason: 'voided' }
  if (market.status === 'open') return Date.parse(market.close_at) > now ? { kind: 'open' } : { kind: 'awaiting' }
  const winner = market.current_resolution?.outcome_id
  const winningPool = market.market_outcomes.find((o) => o.id === winner)?.pool_total ?? bet.amount
  if (winningPool === 0) return { kind: 'refunded', reason: 'no_winners' }
  if (winner !== bet.outcomeId) return { kind: 'lost' }
  const realTotal = market.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0)
  const { pool, total } = effectivePools(winningPool, realTotal, market.seed_per_outcome, market.market_outcomes.length)
  const seeded = Math.floor((bet.amount * total) / pool)
  const opposing = market.current_resolution?.opposing_stake
  const limit = opposing == null ? seeded : Math.floor((bet.amount * (realTotal + Number(opposing))) / winningPool)
  return { kind: 'won', payout: Math.min(seeded, limit) }
}

export const BET_COLUMNS =
  'id, outcome_id, amount, created_at, market_outcomes(label), markets!inner(id, title, status, close_at, seed_per_outcome, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, opposing_stake), market_outcomes(id, pool_total))'

export function toMyBet(b: BetRow, now: number): MyBet {
  return {
    id: b.id,
    marketId: b.markets.id,
    marketTitle: b.markets.title,
    outcomeLabel: b.market_outcomes?.label ?? 'Unknown outcome',
    amount: b.amount,
    placedAt: b.created_at,
    closeAt: b.markets.close_at,
    result: betResult({ outcomeId: b.outcome_id, amount: b.amount }, b.markets, now),
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

// The range read and its key probe share one builder. Its column list is a runtime string, so the
// generated types can't follow it, and each reader casts its rows.
function cancelledQuery(supabase: DbClient, userId: string, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('cancelled_bets').select(columns).eq('profile_id', userId)
  if (filter) query = query.or(filter)
  return query.order('cancelled_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function listMyCancelledBets(
  supabase: DbClient,
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
