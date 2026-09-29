import type { DbClient } from '@/lib/supabase/database'
import { isUuid } from '@/lib/uuid'
import { legStatus, type LegStatus } from './leg-status'
import { combineOdds, lockedOddsToBp, potentialPayout } from './odds'
import type { ParlayLegView, ParlayView } from './list-parlays'

export interface ParlayLegDetail extends ParlayLegView {
  closeAt: string
  marketStatus: 'open' | 'resolved' | 'voided'
  // What the market resolved to, once it has; null while open or voided.
  winningLabel: string | null
  resolvedAt: string | null
}

export interface ParlayDetail extends Omit<ParlayView, 'legs'> {
  ownerId: string
  ownerName: string
  legs: ParlayLegDetail[]
}

// The select list is a runtime string, so the generated types can't follow it and the rows are
// cast. The resolution is embedded through markets' own current_resolution_id, as list-parlays does.
const DETAIL_COLUMNS =
  'id, profile_id, stake, status, credited, created_at, parlay_legs(outcome_id, locked_odds, market_outcomes(label), markets(id, title, status, close_at, market_outcomes(id, label), current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at)))'

interface DetailRow {
  id: string
  profile_id: string
  stake: number
  status: ParlayView['status']
  credited: number
  created_at: string
  parlay_legs: {
    outcome_id: string
    locked_odds: number | string
    market_outcomes: { label: string }
    markets: {
      id: string
      title: string
      status: 'open' | 'resolved' | 'voided'
      close_at: string
      market_outcomes: { id: string; label: string }[]
      current_resolution: { outcome_id: string; resolved_at: string } | null
    }
  }[]
}

export function toParlayDetail(row: DetailRow, ownerName: string): ParlayDetail {
  const legs = row.parlay_legs.map((l): ParlayLegDetail => {
    const resolution = l.markets.current_resolution
    return {
      marketId: l.markets.id,
      marketTitle: l.markets.title,
      outcomeLabel: l.market_outcomes.label,
      lockedOddsBp: lockedOddsToBp(l.locked_odds),
      status: legStatus(l.markets.status, resolution?.outcome_id ?? null, l.outcome_id),
      closeAt: l.markets.close_at,
      marketStatus: l.markets.status,
      winningLabel: resolution ? (l.markets.market_outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null,
      resolvedAt: resolution?.resolved_at ?? null,
    }
  })
  // A voided leg drops out, and the parlay carries on with the rest (settle_parlay).
  const activeBps = legs.filter((l) => l.status !== 'voided').map((l) => l.lockedOddsBp)
  const { multiplierBp, capped } = combineOdds(activeBps)
  return {
    id: row.id,
    ownerId: row.profile_id,
    ownerName,
    stake: row.stake,
    status: row.status,
    credited: row.credited,
    multiplierBp,
    capped,
    potentialPayout: potentialPayout(row.stake, activeBps),
    createdAt: row.created_at,
    legs,
  }
}

// One parlay for its detail page, or null when the id isn't one, or RLS shows the member nothing.
export async function getParlayDetail(supabase: DbClient, id: string): Promise<ParlayDetail | null> {
  if (!isUuid(id)) return null
  const { data, error } = await supabase.from('parlays').select(DETAIL_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as DetailRow
  const { data: owner, error: ownerError } = await supabase.from('profiles').select('display_name').eq('id', row.profile_id).maybeSingle()
  if (ownerError) throw ownerError
  return toParlayDetail(row, owner?.display_name ?? 'A member')
}

// How the legs stand, in leg order, for the progress bar and its one-line summary.
export function legTally(legs: { status: LegStatus }[]): { won: number; lost: number; open: number; voided: number } {
  const tally = { won: 0, lost: 0, open: 0, voided: 0 }
  for (const { status } of legs) {
    if (status === 'pending') tally.open++
    else tally[status]++
  }
  return tally
}

export function tallySummary(tally: ReturnType<typeof legTally>): string {
  const parts = [
    tally.won > 0 && `${tally.won} won`,
    tally.lost > 0 && `${tally.lost} lost`,
    tally.open > 0 && `${tally.open} open`,
    tally.voided > 0 && `${tally.voided} voided`,
  ].filter(Boolean)
  return parts.join(' · ')
}
