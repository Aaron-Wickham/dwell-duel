import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketSummary {
  id: string
  title: string
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export async function listMarkets(supabase: SupabaseClient): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, title, kind, status, close_at, current_resolution_id, market_outcomes(id, label, pool_total)')
    .order('created_at', { ascending: false })
    // Same tiebreak as getMarket: insertion time, then label, so outcome order (and
    // therefore colour assignment) is stable across requests.
    .order('created_at', { referencedTable: 'market_outcomes' })
    .order('label', { referencedTable: 'market_outcomes' })

  if (error) throw error

  const resolutionIds = (data ?? [])
    .map((m) => m.current_resolution_id)
    .filter((id): id is string => id !== null)

  const resolutionById = new Map<string, { outcomeId: string; resolvedAt: string }>()
  if (resolutionIds.length > 0) {
    const { data: resolutions, error: resolutionsErr } = await supabase
      .from('market_resolutions')
      .select('id, outcome_id, resolved_at')
      .in('id', resolutionIds)
    if (resolutionsErr) throw resolutionsErr
    for (const r of resolutions ?? []) resolutionById.set(r.id, { outcomeId: r.outcome_id, resolvedAt: r.resolved_at })
  }

  return (data ?? []).map((m) => {
    const outcomes = (m.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
      id: o.id,
      label: o.label,
      poolTotal: o.pool_total,
    }))
    const resolution = m.current_resolution_id ? resolutionById.get(m.current_resolution_id) : undefined
    const resolvedOutcomeLabel = resolution ? (outcomes.find((o) => o.id === resolution.outcomeId)?.label ?? null) : null

    return {
      id: m.id,
      title: m.title,
      kind: m.kind,
      status: m.status,
      closeAt: m.close_at,
      resolvedOutcomeLabel,
      resolvedAt: resolution?.resolvedAt ?? null,
      outcomes,
    }
  })
}
