import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketDetail {
  id: string
  title: string
  description: string | null
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  createdBy: string
  creatorName: string
  currentResolutionId: string | null
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export interface MarketBet {
  id: number
  outcomeId: string
  amount: number
  createdAt: string
  profileId: string
  bettorName: string
}

export async function getMarket(supabase: SupabaseClient, marketId: string): Promise<MarketDetail | null> {
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, description, kind, status, close_at, created_by, current_resolution_id, creator:profiles(display_name), market_outcomes(id, label, pool_total)',
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
  let resolvedAt: string | null = null
  if (data.current_resolution_id) {
    const { data: resolution, error: resolutionErr } = await supabase
      .from('market_resolutions')
      .select('outcome_id, resolved_at')
      .eq('id', data.current_resolution_id)
      .single()
    if (resolutionErr) throw resolutionErr
    resolvedOutcomeLabel = outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null
    resolvedAt = resolution.resolved_at
  }

  const creator = data.creator as unknown as { display_name: string } | null

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    kind: data.kind,
    status: data.status,
    closeAt: data.close_at,
    createdBy: data.created_by,
    creatorName: creator?.display_name ?? 'Unknown member',
    currentResolutionId: data.current_resolution_id,
    resolvedOutcomeLabel,
    resolvedAt,
    outcomes,
  }
}

export async function getMarketBets(supabase: SupabaseClient, marketId: string): Promise<MarketBet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('id, outcome_id, amount, created_at, profile_id, profiles(display_name)')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error

  return (data ?? []).map((b) => {
    const profile = b.profiles as unknown as { display_name: string } | null
    return {
      id: b.id,
      outcomeId: b.outcome_id,
      amount: b.amount,
      createdAt: b.created_at,
      profileId: b.profile_id,
      bettorName: profile?.display_name ?? 'Unknown member',
    }
  })
}
