import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketDetail {
  id: string
  title: string
  description: string | null
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  createdBy: string
  currentResolutionId: string | null
  resolvedOutcomeLabel: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export interface OwnBet {
  id: number
  outcomeId: string
  amount: number
  createdAt: string
}

export async function getMarket(supabase: SupabaseClient, marketId: string): Promise<MarketDetail | null> {
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, description, kind, status, close_at, created_by, current_resolution_id, market_outcomes(id, label, pool_total)',
    )
    .eq('id', marketId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const outcomes = (data.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
    id: o.id,
    label: o.label,
    poolTotal: o.pool_total,
  }))

  let resolvedOutcomeLabel: string | null = null
  if (data.current_resolution_id) {
    const { data: resolution, error: resolutionErr } = await supabase
      .from('market_resolutions')
      .select('outcome_id')
      .eq('id', data.current_resolution_id)
      .single()
    if (resolutionErr) throw resolutionErr
    resolvedOutcomeLabel = outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    kind: data.kind,
    status: data.status,
    closeAt: data.close_at,
    createdBy: data.created_by,
    currentResolutionId: data.current_resolution_id,
    resolvedOutcomeLabel,
    outcomes,
  }
}

export async function getOwnBets(supabase: SupabaseClient, marketId: string, userId: string): Promise<OwnBet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('id, outcome_id, amount, created_at')
    .eq('market_id', marketId)
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((b) => ({ id: b.id, outcomeId: b.outcome_id, amount: b.amount, createdAt: b.created_at }))
}
