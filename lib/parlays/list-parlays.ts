import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { combineOdds, lockedOddsToBp, potentialPayout } from './odds'
import { legStatus, type LegStatus } from './leg-status'

export interface ParlayLegView {
  marketId: string
  marketTitle: string
  outcomeLabel: string
  // The leg's odds: set once its market has closed or settled (known), and until then what the
  // market's pool would give it now (0074). A parlay placed before 0074 had every leg's odds locked
  // when it was placed, so they're all known.
  oddsBp: number
  oddsKnown: boolean
  status: LegStatus
}

export interface ParlayView {
  id: string
  stake: number
  status: 'pending' | 'won' | 'lost' | 'refunded'
  credited: number
  // The parlay's own multiplier cap: 100x for parlays placed before 0074, MAX_MULTIPLIER since.
  maxMultiplier: number
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
  created_at: string
  parlay_legs: LegRow[]
}

export const PARLAY_COLUMNS =
  'id, stake, status, credited, max_multiplier, created_at, parlay_legs(outcome_id, locked_odds, market_outcomes(label), markets(id, title, status, close_at, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id)))'

// A leg's odds, keyed by `${parlayId}:${outcomeId}`, from parlay_leg_odds (0074).
export type LegOdds = Map<string, { oddsBp: number; known: boolean }>

const legKey = (parlayId: string, outcomeId: string) => `${parlayId}:${outcomeId}`

// The odds of every leg that has none set yet, for the parlays given: what each market's pool
// would give the parlay's owner now. Legs with set odds read them from their own row.
export async function fetchLegOdds(supabase: DbClient, parlays: Pick<ParlayRow, 'id' | 'parlay_legs'>[]): Promise<LegOdds> {
  const odds: LegOdds = new Map()
  const unpriced = parlays.filter((p) => p.parlay_legs.some((l) => l.locked_odds === null)).map((p) => p.id)
  for (const part of chunk(unpriced, IN_CHUNK)) {
    const { data, error } = await supabase.rpc('parlay_leg_odds', { p_parlay_ids: part })
    if (error) throw error
    for (const l of data ?? []) odds.set(legKey(l.parlay_id, l.outcome_id), { oddsBp: lockedOddsToBp(l.odds), known: l.known })
  }
  return odds
}

export function toParlayView(p: ParlayRow, now: number, legOdds: LegOdds): ParlayView {
  const legs = p.parlay_legs.map((l): ParlayLegView => {
    const winner = l.markets.current_resolution?.outcome_id ?? null
    const quoted = l.locked_odds === null ? legOdds.get(legKey(p.id, l.outcome_id)) : undefined
    return {
      marketId: l.markets.id,
      marketTitle: l.markets.title,
      outcomeLabel: l.market_outcomes.label,
      oddsBp: l.locked_odds !== null ? lockedOddsToBp(l.locked_odds) : (quoted?.oddsBp ?? 10_000),
      oddsKnown: l.locked_odds !== null || (quoted?.known ?? false),
      status: legStatus(l.markets.status, winner, l.outcome_id, l.markets.close_at, now),
    }
  })

  // A voided leg drops out, and the parlay carries on with the rest (settle_parlay).
  const counted = legs.filter((l) => l.status !== 'voided')
  const activeBps = counted.map((l) => l.oddsBp)
  const { multiplierBp, capped } = combineOdds(activeBps, p.max_multiplier)

  return {
    id: p.id,
    stake: p.stake,
    status: p.status,
    credited: p.credited,
    maxMultiplier: p.max_multiplier,
    multiplierBp,
    capped,
    estimated: counted.some((l) => !l.oddsKnown),
    potentialPayout: potentialPayout(p.stake, activeBps, p.max_multiplier),
    createdAt: p.created_at,
    legs,
  }
}
