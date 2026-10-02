import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { combineOdds, factorBp, fixedParlay, lockedOddsToBp, potentialPayout } from './odds'
import { legStatus, type LegStatus } from './leg-status'

export interface ParlayLegView {
  marketId: string
  marketTitle: string
  outcomeLabel: string
  // The leg's odds: set once its market has closed or settled (known), and until then what the
  // market's pool would give it now (0074). A parlay placed before 0074 had every leg's odds locked
  // when it was placed, and a fixed parlay's legs have their factors from placement (0104), so
  // theirs are all known.
  oddsBp: number
  oddsKnown: boolean
  status: LegStatus
}

export interface ParlayView {
  id: string
  stake: number
  status: 'pending' | 'won' | 'lost' | 'refunded'
  credited: number
  // The parlay's own multiplier cap: MAX_MULTIPLIER, or 100x for one settled before 0074.
  maxMultiplier: number
  // Placed before 0074: every leg's odds were locked when it was placed, not set at close.
  lockedAtPlacement: boolean
  // On lmsr markets (0104): the stake was split across the legs, and the multiplier and payout
  // were fixed when it was placed. No cap applies, except to a pool parlay converted at release
  // (0105), which keeps its pool caps.
  fixed: boolean
  // A pool parlay converted at release (0105): its odds came from the pools and were fixed then.
  converted: boolean
  multiplierBp: number
  capped: boolean
  // Some leg that still counts has no set odds yet, so the multiplier and payout are estimates.
  estimated: boolean
  potentialPayout: number
  createdAt: string
  legs: ParlayLegView[]
}

interface LegRow {
  outcome_id: string
  locked_odds: number | string | null
  factor: number | string | null
  market_outcomes: { label: string }
  markets: {
    id: string
    title: string
    status: 'open' | 'resolved' | 'voided'
    close_at: string
    current_resolution: { outcome_id: string } | null
  }
}

export interface ParlayRow {
  id: string
  stake: number
  status: ParlayView['status']
  credited: number
  max_multiplier: number
  odds_at_close: boolean
  multiplier: number | string | null
  payout: number | null
  converted: boolean
  created_at: string
  parlay_legs: LegRow[]
}

export const PARLAY_COLUMNS =
  'id, stake, status, credited, max_multiplier, odds_at_close, multiplier, payout, converted, created_at, parlay_legs(outcome_id, locked_odds, factor, market_outcomes(label), markets(id, title, status, close_at, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id)))'

// A leg's odds, keyed by `${parlayId}:${outcomeId}`, from parlay_leg_odds (0074).
export type LegOdds = Map<string, { oddsBp: number; known: boolean }>

const legKey = (parlayId: string, outcomeId: string) => `${parlayId}:${outcomeId}`

// The odds of every leg that has none set yet, for the parlays given: what each market's pool
// would give the parlay's owner now. Legs with set odds read them from their own row.
export async function fetchLegOdds(supabase: DbClient, parlays: Pick<ParlayRow, 'id' | 'parlay_legs'>[]): Promise<LegOdds> {
  const odds: LegOdds = new Map()
  const unpriced = parlays.filter((p) => p.parlay_legs.some((l) => l.locked_odds === null && l.factor === null)).map((p) => p.id)
  for (const part of chunk(unpriced, IN_CHUNK)) {
    const { data, error } = await supabase.rpc('parlay_leg_odds', { p_parlay_ids: part })
    if (error) throw error
    for (const l of data ?? []) odds.set(legKey(l.parlay_id, l.outcome_id), { oddsBp: lockedOddsToBp(l.odds), known: l.known })
  }
  return odds
}

// A leg's odds and whether they're set: a fixed leg's factor, a locked leg's odds, or else what
// parlay_leg_odds quoted for it.
export function legOddsOf(
  parlayId: string,
  leg: Pick<LegRow, 'outcome_id' | 'locked_odds' | 'factor'>,
  legOdds: LegOdds,
): { oddsBp: number; oddsKnown: boolean } {
  if (leg.factor !== null) return { oddsBp: factorBp(leg.factor), oddsKnown: true }
  if (leg.locked_odds !== null) return { oddsBp: lockedOddsToBp(leg.locked_odds), oddsKnown: true }
  const quoted = legOdds.get(legKey(parlayId, leg.outcome_id))
  return { oddsBp: quoted?.oddsBp ?? 10_000, oddsKnown: quoted?.known ?? false }
}

// The multiplier and payout of the legs that still count (a voided leg drops out, settle_parlay):
// a fixed parlay's from its factors, exactly, with no cap; a pool parlay's from its odds, capped. A
// converted parlay (0105) is fixed, with its pool caps: its stored payout, or with a leg voided, what
// settle_parlay pays, least(capped payout of the rest, stored payout), which the caps already keep.
export function parlayTerms(
  p: Pick<ParlayRow, 'stake' | 'max_multiplier' | 'multiplier' | 'payout' | 'converted'>,
  counted: { oddsBp: number; factor: number | string | null }[],
  anyVoided: boolean,
): Pick<ParlayView, 'fixed' | 'multiplierBp' | 'capped' | 'potentialPayout'> {
  if (p.multiplier !== null && p.converted) {
    const bps = counted.map((l) => l.oddsBp)
    return {
      fixed: true,
      ...combineOdds(bps, p.max_multiplier),
      potentialPayout: anyVoided || p.payout === null ? potentialPayout(p.stake, bps, p.max_multiplier) : p.payout,
    }
  }
  if (p.multiplier !== null) {
    const terms = fixedParlay(p.stake, counted.map((l) => l.factor ?? 1))
    return { fixed: true, multiplierBp: terms.multiplierBp, capped: false, potentialPayout: anyVoided ? terms.payout : (p.payout ?? terms.payout) }
  }
  const activeBps = counted.map((l) => l.oddsBp)
  return {
    fixed: false,
    ...combineOdds(activeBps, p.max_multiplier),
    potentialPayout: potentialPayout(p.stake, activeBps, p.max_multiplier),
  }
}

export function toParlayView(p: ParlayRow, now: number, legOdds: LegOdds): ParlayView {
  const rows = p.parlay_legs.map((l) => {
    const winner = l.markets.current_resolution?.outcome_id ?? null
    const view: ParlayLegView = {
      marketId: l.markets.id,
      marketTitle: l.markets.title,
      outcomeLabel: l.market_outcomes.label,
      ...legOddsOf(p.id, l, legOdds),
      status: legStatus(l.markets.status, winner, l.outcome_id, l.markets.close_at, now),
    }
    return { view, factor: l.factor }
  })
  const legs = rows.map((r) => r.view)
  const counted = rows.filter((r) => r.view.status !== 'voided')

  return {
    id: p.id,
    stake: p.stake,
    status: p.status,
    credited: p.credited,
    maxMultiplier: p.max_multiplier,
    lockedAtPlacement: !p.odds_at_close,
    converted: p.converted,
    ...parlayTerms(p, counted.map((r) => ({ oddsBp: r.view.oddsBp, factor: r.factor })), counted.length < rows.length),
    estimated: counted.some((r) => !r.view.oddsKnown),
    createdAt: p.created_at,
    legs,
  }
}
