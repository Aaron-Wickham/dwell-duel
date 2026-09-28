import type { SupabaseClient } from '@supabase/supabase-js'
import { PROOF_COLUMNS, toProofViews, type ProofRow } from '@/lib/proof/signed'
import type { ProofView } from '@/lib/proof/types'

export interface MyCompletion {
  taskId: string
  status: 'pending' | 'approved' | 'rejected'
  periodKey: string
  rewardAmount: number
  reviewNote: string | null
  proofCount: number
}

export async function listMyTaskCompletions(supabase: SupabaseClient, profileId: string): Promise<MyCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, status, period_key, reward_amount, review_note, proof_attachments(id)')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status,
    periodKey: c.period_key,
    rewardAmount: c.reward_amount,
    reviewNote: c.review_note,
    // Ids, not a (count) aggregate: Supabase ships with PostgREST's aggregates turned off.
    proofCount: (c.proof_attachments as unknown as { id: string }[] | null)?.length ?? 0,
  }))
}

export interface PendingCompletion {
  id: string
  taskTitle: string
  submitterId: string
  submitterName: string
  rewardAmount: number
  submittedAt: string
  note: string | null
  proof: ProofView[]
}

// `withProof` signs the attachments' URLs for the review queue; Home only needs the count.
export async function listPendingTaskCompletions(
  supabase: SupabaseClient,
  { withProof = false }: { withProof?: boolean } = {},
): Promise<PendingCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select(
      `id, profile_id, reward_amount, submitted_at, note, tasks(title), profiles!task_completions_profile_id_fkey(display_name)${withProof ? `, proof_attachments(${PROOF_COLUMNS})` : ''}`,
    )
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as unknown as {
    id: string
    profile_id: string
    reward_amount: number
    submitted_at: string
    note: string | null
    tasks: { title: string } | null
    profiles: { display_name: string } | null
    proof_attachments?: ProofRow[]
  }[]
  const proof = withProof ? await toProofViews(supabase, rows.flatMap((c) => c.proof_attachments ?? [])) : []

  return rows.map((c) => {
    const ids = new Set((c.proof_attachments ?? []).map((p) => p.id))
    return {
      id: c.id,
      taskTitle: c.tasks?.title ?? 'Unknown task',
      submitterId: c.profile_id,
      submitterName: c.profiles?.display_name ?? 'Unknown member',
      rewardAmount: c.reward_amount,
      submittedAt: c.submitted_at,
      note: c.note,
      proof: proof.filter((p) => ids.has(p.id)),
    }
  })
}
