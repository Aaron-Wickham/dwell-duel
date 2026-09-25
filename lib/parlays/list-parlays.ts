import type { SupabaseClient } from '@supabase/supabase-js'
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
  markets: { id: string; title: string; status: 'open' | 'resolved' | 'voided'; current_resolution_id: string | null }
}

interface ParlayRow {
  id: string
  stake: number
  status: ParlayView['status']
  credited: number
  created_at: string
  parlay_legs: LegRow[]
}

export async function listMyParlays(supabase: SupabaseClient, userId: string): Promise<ParlayView[]> {
  const { data, error } = await supabase
    .from('parlays')
    .select(
      'id, stake, status, credited, created_at, parlay_legs(outcome_id, locked_odds, market_outcomes(label), markets(id, title, status, current_resolution_id))',
    )
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as unknown as ParlayRow[]

  const resolutionIds = [
    ...new Set(
      rows.flatMap((p) =>
        p.parlay_legs.flatMap((l) => (l.markets.current_resolution_id ? [l.markets.current_resolution_id] : [])),
      ),
    ),
  ]

  const winnerByResolution = new Map<string, string>()
  if (resolutionIds.length > 0) {
    const { data: resolutions, error: resolutionsErr } = await supabase
      .from('market_resolutions')
      .select('id, outcome_id')
      .in('id', resolutionIds)
    if (resolutionsErr) throw resolutionsErr
    for (const r of resolutions ?? []) winnerByResolution.set(r.id, r.outcome_id)
  }

  return rows.map((p) => {
    const legs = p.parlay_legs.map((l): ParlayLegView => {
      const winner = l.markets.current_resolution_id
        ? (winnerByResolution.get(l.markets.current_resolution_id) ?? null)
        : null
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
  })
}
