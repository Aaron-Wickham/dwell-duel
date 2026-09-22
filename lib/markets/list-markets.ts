import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketSummary {
  id: string
  title: string
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export async function listMarkets(supabase: SupabaseClient): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('markets')
    .select('id, title, kind, status, close_at, market_outcomes(id, label, pool_total)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    closeAt: m.close_at,
    outcomes: (m.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
      id: o.id,
      label: o.label,
      poolTotal: o.pool_total,
    })),
  }))
}
