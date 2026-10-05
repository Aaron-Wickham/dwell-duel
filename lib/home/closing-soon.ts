import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { fetchLegOdds, PARLAY_COLUMNS, toParlayView, type ParlayRow } from '@/lib/parlays/list-parlays'

// Home's Your bets (#388): the member's next few open bets and parlays, soonest to close first. A
// market past its close but not yet resolved still counts as open, as on My bets, and sorts first.
export type ClosingWager =
  | { kind: 'bet'; key: string; marketId: string; marketTitle: string; outcomeLabel: string; amount: number; payout: number | null; closeAt: string }
  | { kind: 'parlay'; key: string; parlayId: string; legCount: number; stake: number; payout: number; estimated: boolean; closeAt: string }

export type ClosingMarket = { id: string; title: string; closeAt: string }

// How many pending parlays are weighed for "closing soonest". A member with more than this many
// open at once still sees some of them, just not necessarily the very soonest.
const PARLAY_SCAN = 100

type Candidate = { key: string; closeAt: string }

// A parlay closes, for this list, when its next open leg's market does; once every leg's market
// has closed it waits on results, from its earliest close.
function parlayCloseAt(legs: { markets: { close_at: string; status: string } | null }[]): string | null {
  const markets = legs.flatMap((l) => (l.markets ? [l.markets] : []))
  const open = markets.filter((m) => m.status === 'open')
  const times = (open.length > 0 ? open : markets).map((m) => m.close_at).sort()
  return times[0] ?? null
}

export async function getClosingSoon(supabase: DbClient, userId: string, limit = 3): Promise<ClosingWager[]> {
  // The markets read finds the soonest few the member has a bet on through the index on
  // (status, close_at), rather than reading every bet they've placed.
  const [betMarkets, pending] = await Promise.all([
    supabase
      .from('markets')
      .select('id, title, close_at, bets!inner(id, amount, shares, profile_id, market_outcomes(label))')
      .eq('status', 'open')
      .eq('bets.profile_id', userId)
      .order('close_at', { ascending: true })
      .limit(limit),
    supabase
      .from('parlays')
      .select('id, parlay_legs(markets(close_at, status))')
      .eq('profile_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(PARLAY_SCAN),
  ])
  if (betMarkets.error) throw betMarkets.error
  if (pending.error) throw pending.error

  const bets = new Map<string, Extract<ClosingWager, { kind: 'bet' }>>()
  for (const m of betMarkets.data ?? []) {
    for (const b of m.bets) {
      bets.set(`bet:${b.id}`, {
        kind: 'bet',
        key: `bet:${b.id}`,
        marketId: m.id,
        marketTitle: m.title,
        outcomeLabel: b.market_outcomes?.label ?? 'Unknown outcome',
        amount: b.amount,
        // An lmsr bet pays one DC a share, rounded down (0102); a converted bet's shares are the
        // "Pays ~" it showed (0105).
        payout: b.shares === null ? null : Math.floor(Number(b.shares)),
        closeAt: m.close_at,
      })
    }
  }
  const candidates: Candidate[] = [...bets.values()].map(({ key, closeAt }) => ({ key, closeAt }))
  for (const p of pending.data ?? []) {
    const closeAt = parlayCloseAt(p.parlay_legs)
    if (closeAt) candidates.push({ key: `parlay:${p.id}`, closeAt })
  }
  const chosen = candidates.sort((a, b) => a.closeAt.localeCompare(b.closeAt) || a.key.localeCompare(b.key)).slice(0, limit)

  const parlayIds = chosen.filter((c) => c.key.startsWith('parlay:')).map((c) => c.key.slice(7))
  const parlays = new Map<string, ParlayRow>()
  for (const part of chunk(parlayIds, IN_CHUNK)) {
    const { data, error } = await supabase.from('parlays').select(PARLAY_COLUMNS).in('id', part)
    if (error) throw error
    for (const row of (data ?? []) as ParlayRow[]) parlays.set(row.id, row)
  }
  const legOdds = await fetchLegOdds(supabase, [...parlays.values()])
  const now = Date.now()

  return chosen.flatMap((c): ClosingWager[] => {
    const bet = bets.get(c.key)
    if (bet) return [bet]
    const row = parlays.get(c.key.slice(7))
    if (!row) return []
    const view = toParlayView(row, now, legOdds)
    return [
      {
        kind: 'parlay',
        key: c.key,
        parlayId: view.id,
        legCount: view.legs.length,
        stake: view.stake,
        payout: view.potentialPayout,
        estimated: view.estimated,
        closeAt: c.closeAt,
      },
    ]
  })
}

// For a member with nothing open: what they could bet on next.
export async function getMarketsClosingSoon(supabase: DbClient, limit = 3, now: number = Date.now()): Promise<ClosingMarket[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, title, close_at')
    .eq('status', 'open')
    .gt('close_at', new Date(now).toISOString())
    .order('close_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((m) => ({ id: m.id, title: m.title, closeAt: m.close_at }))
}

// Whether the member has a settled bet or parlay, and an approved task: rank shows only after the
// first, and Getting started never shows to a member with both (#388).
export async function getHomeHistory(supabase: DbClient, userId: string): Promise<{ settledBet: boolean; approvedTask: boolean }> {
  const [settled, approved] = await Promise.all([
    supabase.from('my_wagers').select('id').eq('profile_id', userId).eq('bucket', 'settled').limit(1),
    supabase.from('task_completions').select('id').eq('profile_id', userId).eq('status', 'approved').limit(1),
  ])
  if (settled.error) throw settled.error
  if (approved.error) throw approved.error
  return { settledBet: (settled.data ?? []).length > 0, approvedTask: (approved.data ?? []).length > 0 }
}
