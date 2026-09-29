import type { DbClient } from '@/lib/supabase/database'
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

export async function listMyTaskCompletions(supabase: DbClient, profileId: string): Promise<MyCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, status, period_key, reward_amount, review_note, proof_attachments(id)')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status as MyCompletion['status'], // a CHECK-constrained text column
    periodKey: c.period_key,
    rewardAmount: c.reward_amount,
    reviewNote: c.review_note,
    // Ids, not a (count) aggregate: Supabase ships with PostgREST's aggregates turned off.
    proofCount: c.proof_attachments.length,
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

// The review queue, oldest first, with each submission's proof signed for this viewer.
export async function listPendingTaskCompletions(supabase: DbClient): Promise<PendingCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select(
      `id, profile_id, reward_amount, submitted_at, note, tasks(title), profiles!task_completions_profile_id_fkey(display_name), proof_attachments(${PROOF_COLUMNS})`,
    )
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw error

  const rows = data ?? []
  // proof_attachments.kind is a CHECK-constrained text column, so the generated type says string.
  const proof = await toProofViews(supabase, rows.flatMap((c) => c.proof_attachments) as ProofRow[])

  return rows.map((c) => {
    const ids = new Set(c.proof_attachments.map((p) => p.id))
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

// Home's counts (#68): only the pending rows, and only the columns the counts need.
export async function getMyPendingRewards(supabase: DbClient, profileId: string): Promise<{ count: number; dc: number }> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('reward_amount')
    .eq('profile_id', profileId)
    .eq('status', 'pending')
  if (error) throw error
  const rows = data ?? []
  return { count: rows.length, dc: rows.reduce((sum, r) => sum + r.reward_amount, 0) }
}

export async function countPendingTaskCompletions(supabase: DbClient): Promise<number> {
  const { count, error } = await supabase
    .from('task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}
