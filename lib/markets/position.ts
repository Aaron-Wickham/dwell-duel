import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { betResult, type MyBetResult } from '@/lib/bets/list-my-bets'
import { fetchLegOdds, PARLAY_COLUMNS, toParlayView, type ParlayLegView, type ParlayRow, type ParlayView } from '@/lib/parlays/list-parlays'
import type { MarketDetail } from './get-market'

export interface PositionKeys {
  betIds: number[]
  parlayIds: string[]
}

export interface PositionBet {
  id: number
  outcomeLabel: string
  amount: number
  placedAt: string
  result: MyBetResult
  // What it pays if its outcome wins, fixed when it was placed (0102), while the market is open or
  // awaiting its result. Every such market is lmsr since 0105. Null once settled; the result says
  // what it did.
  paysIfWins: number | null
}

export interface PositionLeg {
  parlay: ParlayView
  leg: ParlayLegView
}

export interface MarketPosition {
  bets: PositionBet[]
  legs: PositionLeg[]
}

// my_market_position (0096): the keys of the viewer's own bets and parlays on this market, oldest
// first. Empty means the page shows no position card at all.
export async function getPositionKeys(supabase: DbClient, marketId: string): Promise<PositionKeys> {
  const { data, error } = await supabase.rpc('my_market_position', { p_market_id: marketId })
  if (error) throw error
  const betIds: number[] = []
  const parlayIds: string[] = []
  for (const row of data ?? []) {
    if (row.bet_id !== null) betIds.push(row.bet_id)
    else if (row.parlay_id !== null) parlayIds.push(row.parlay_id)
  }
  return { betIds, parlayIds }
}

type BetRow = { id: number; outcome_id: string; amount: number; shares: number | null; refund_outcomes: string[]; created_at: string }

// The rows the keys name. A bet cancelled between the two reads is simply left out.
export async function getMarketPosition(
  supabase: DbClient,
  market: MarketDetail,
  keys: PositionKeys,
  now: number,
): Promise<MarketPosition> {
  const [betRows, parlayRows] = await Promise.all([
    (async () => {
      const rows = new Map<number, BetRow>()
      for (const part of chunk(keys.betIds, IN_CHUNK)) {
        const { data, error } = await supabase.from('bets').select('id, outcome_id, amount, shares, refund_outcomes, created_at').in('id', part)
        if (error) throw error
        for (const row of data ?? []) rows.set(row.id, row)
      }
      return rows
    })(),
    (async () => {
      const rows = new Map<string, ParlayRow>()
      for (const part of chunk(keys.parlayIds, IN_CHUNK)) {
        const { data, error } = await supabase.from('parlays').select(PARLAY_COLUMNS).in('id', part)
        if (error) throw error
        for (const row of (data ?? []) as ParlayRow[]) rows.set(row.id, row)
      }
      return rows
    })(),
  ])
  const legOdds = await fetchLegOdds(supabase, [...parlayRows.values()])

  const embed = {
    pricing: market.pricing,
    status: market.status,
    close_at: market.closeAt,
    current_resolution: market.resolvedOutcomeId
      ? { outcome_id: market.resolvedOutcomeId, payout_seed: market.payoutSeed }
      : null,
    market_outcomes: market.outcomes.map((o) => ({ id: o.id, pool_total: o.poolTotal })),
  }

  const bets: PositionBet[] = []
  for (const id of keys.betIds) {
    const b = betRows.get(id)
    if (!b) continue
    const outcome = market.outcomes.find((o) => o.id === b.outcome_id)
    const result = betResult({ outcomeId: b.outcome_id, amount: b.amount, shares: b.shares, refundOutcomes: b.refund_outcomes }, embed, now)
    const live = result.kind === 'open' || result.kind === 'awaiting'
    bets.push({
      id: b.id,
      outcomeLabel: outcome?.label ?? 'Unknown outcome',
      amount: b.amount,
      placedAt: b.created_at,
      result,
      paysIfWins: live && b.shares !== null ? Math.floor(Number(b.shares)) : null,
    })
  }

  const legs: PositionLeg[] = []
  for (const id of keys.parlayIds) {
    const row = parlayRows.get(id)
    if (!row) continue
    const parlay = toParlayView(row, now, legOdds)
    const leg = parlay.legs.find((l) => l.marketId === market.id)
    if (leg) legs.push({ parlay, leg })
  }

  return { bets, legs }
}

// The card's line under its heading: what's on the market while it's open, the net result once it
// has settled. Null when there's nothing to say: only parlay legs, or a net of 0 that wasn't a refund.
export function positionSummary(bets: PositionBet[]): { tone: 'plain' | 'win' | 'loss'; text: string } | null {
  if (bets.length === 0) return null
  const staked = bets.reduce((sum, b) => sum + b.amount, 0)
  if (bets.some((b) => b.result.kind === 'open')) {
    return { tone: 'plain', text: `${staked} DC on this market · Bets are final.` }
  }
  if (bets.some((b) => b.result.kind === 'awaiting')) {
    return { tone: 'plain', text: `${staked} DC on this market · Waiting on the result.` }
  }
  if (bets.every((b) => b.result.kind === 'refunded')) {
    return { tone: 'plain', text: bets.length === 1 ? 'Your bet was refunded.' : 'Your bets were refunded.' }
  }
  const net = bets.reduce((sum, b) => {
    if (b.result.kind === 'won') return sum + b.result.payout - b.amount
    if (b.result.kind === 'lost') return sum - b.amount
    return sum
  }, 0)
  if (net > 0) return { tone: 'win', text: `You won ${net} DC on this market.` }
  if (net < 0) return { tone: 'loss', text: `You lost ${-net} DC on this market.` }
  return null
}

const picks = (n: number) => `${n} ${n === 1 ? 'pick' : 'picks'}`

// A parlay leg's line: the parlay while its leg is still in play, then what the leg and the parlay did.
export function legSummary({ parlay, leg }: PositionLeg): string {
  switch (parlay.status) {
    case 'won':
      return `Parlay won ${parlay.credited} DC`
    case 'lost':
      return 'Parlay lost'
    case 'refunded':
      return 'Parlay refunded'
  }
  if (leg.status === 'won') {
    const waiting = parlay.legs.filter((l) => l.status === 'open' || l.status === 'awaiting').length
    return `Your leg won. The parlay waits on ${waiting} more ${waiting === 1 ? 'pick' : 'picks'}.`
  }
  if (leg.status === 'voided') return 'Leg voided; the parlay continues without it.'
  const pays = `${parlay.stake} DC · ${picks(parlay.legs.length)} · pays ${parlay.estimated ? '~' : ''}${parlay.potentialPayout} DC if every pick wins.`
  return leg.oddsKnown ? pays : `${pays} Leg odds are set when this market closes.`
}
