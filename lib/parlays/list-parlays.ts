import { combineOdds, lockedOddsToBp, potentialPayout } from './odds'
import { legStatus, type LegStatus } from './leg-status'

export interface ParlayLegView {
  marketId: string
  marketTitle: string
  outcomeLabel: string
  lockedOddsBp: number
  status: LegStatus
}

export interface ParlayView {
  id: string
  stake: number
  status: 'pending' | 'won' | 'lost' | 'refunded'
  credited: number
  multiplierBp: number
  capped: boolean
  potentialPayout: number
  createdAt: string
  legs: ParlayLegView[]
}

interface LegRow {
  outcome_id: string
  locked_odds: number | string
  market_outcomes: { label: string }
  markets: {
    id: string
    title: string
    status: 'open' | 'resolved' | 'voided'
    current_resolution: { outcome_id: string } | null
  }
}

export interface ParlayRow {
  id: string
  stake: number
  status: ParlayView['status']
  credited: number
  created_at: string
  parlay_legs: LegRow[]
}

export const PARLAY_COLUMNS =
  'id, stake, status, credited, created_at, parlay_legs(outcome_id, locked_odds, market_outcomes(label), markets(id, title, status, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id)))'

export function toParlayView(p: ParlayRow): ParlayView {
  const legs = p.parlay_legs.map((l): ParlayLegView => {
    const winner = l.markets.current_resolution?.outcome_id ?? null
    return {
      marketId: l.markets.id,
      marketTitle: l.markets.title,
      outcomeLabel: l.market_outcomes.label,
      lockedOddsBp: lockedOddsToBp(l.locked_odds),
      status: legStatus(l.markets.status, winner, l.outcome_id),
    }
  })

  const activeBps = legs.filter((l) => l.status !== 'voided').map((l) => l.lockedOddsBp)
  const { multiplierBp, capped } = combineOdds(activeBps)

  return {
    id: p.id,
    stake: p.stake,
    status: p.status,
    credited: p.credited,
    multiplierBp,
    capped,
    potentialPayout: potentialPayout(p.stake, activeBps),
    createdAt: p.created_at,
    legs,
  }
}
