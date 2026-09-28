import type { SupabaseClient } from '@supabase/supabase-js'
import { PROOF_COLUMNS, toProofViews, type ProofRow } from '@/lib/proof/signed'
import type { ProofView } from '@/lib/proof/types'

export interface ResolutionProof {
  note: string | null
  proof: ProofView[]
  // The resolution an override replaced, if any: what it picked and why.
  previous: { outcomeLabel: string; note: string | null; proof: ProofView[] } | null
}

type Row = {
  id: string
  note: string | null
  reversed_at: string | null
  market_outcomes: { label: string } | null
  proof_attachments: ProofRow[]
}

// The current resolution's reason and proof (0042), plus the one it overrode, newest first.
export async function getResolutionProof(supabase: SupabaseClient, marketId: string): Promise<ResolutionProof | null> {
  const { data, error } = await supabase
    .from('market_resolutions')
    .select(`id, note, reversed_at, market_outcomes(label), proof_attachments(${PROOF_COLUMNS})`)
    .eq('market_id', marketId)
    .order('resolved_at', { ascending: false })
    .limit(2)
  if (error) throw error
  const rows = (data ?? []) as unknown as Row[]
  const current = rows.find((r) => r.reversed_at === null)
  if (!current) return null
  const previous = rows.find((r) => r.id !== current.id) ?? null

  const views = await toProofViews(supabase, [...current.proof_attachments, ...(previous?.proof_attachments ?? [])])
  const pick = (r: Row) => views.filter((v) => r.proof_attachments.some((p) => p.id === v.id))
  return {
    note: current.note,
    proof: pick(current),
    previous: previous
      ? { outcomeLabel: previous.market_outcomes?.label ?? 'another outcome', note: previous.note, proof: pick(previous) }
      : null,
  }
}
