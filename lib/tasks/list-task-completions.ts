import type { DbClient } from '@/lib/supabase/database'
import { PROOF_COLUMNS, toProofViews, type ProofRow } from '@/lib/proof/signed'
import type { ProofView } from '@/lib/proof/types'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'

export interface MyCompletion {
  taskId: string
  status: 'pending' | 'approved' | 'rejected'
  rewardAmount: number
  reviewNote: string | null
  proofCount: number
}

// The newest completion of the current period for each task the member has touched, filtered in
// SQL against each task's period (0071), so the Tasks page reads O(tasks) rows however long the
// member's history is, and never asks for the period keys in a round trip of its own (#206).
export async function listMyTaskCompletions(supabase: DbClient): Promise<MyCompletion[]> {
  const { data, error } = await supabase.rpc('my_current_task_completions')
  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status as MyCompletion['status'], // a CHECK-constrained text column
    rewardAmount: c.reward_amount,
    reviewNote: c.review_note,
    proofCount: c.proof_count,
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

// Oldest first, so the submission that has waited longest leads.
const PENDING_KEYS: KeyColumns = { ts: 'submitted_at', id: 'id', isId: isUuid, ascending: true }

function pendingQuery<Columns extends string>(supabase: DbClient, columns: Columns, filter: string | null, limit: number) {
  let query = supabase.from('task_completions').select(columns).eq('status', 'pending')
  if (filter) query = query.or(filter)
  return query.order('submitted_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
}

// One page of the review queue. Proof is signed only for the rows returned, so a long queue costs
// one page of signatures per load, not the whole queue (#255).
export async function listPendingTaskCompletions(
  supabase: DbClient,
  page: PageParams,
): Promise<KeysetPage<PendingCompletion>> {
  const keyOf = (c: { id: string; submitted_at: string }): Cursor => ({ ts: c.submitted_at, id: c.id })
  const result = await readKeyset(
    page,
    PENDING_KEYS,
    async (filter, limit) => {
      const { data, error } = await pendingQuery(
        supabase,
        `id, profile_id, reward_amount, submitted_at, note, tasks(title), profiles!task_completions_profile_id_fkey(display_name), proof_attachments(${PROOF_COLUMNS})`,
        filter,
        limit,
      )
      if (error) throw error
      return data ?? []
    },
    keyOf,
    async (filter, limit) => {
      const { data, error } = await pendingQuery(supabase, 'id, submitted_at', filter, limit)
      if (error) throw error
      return (data ?? []).map(keyOf)
    },
  )

  // proof_attachments.kind is a CHECK-constrained text column, so the generated type says string.
  const proof = await toProofViews(supabase, result.rows.flatMap((c) => c.proof_attachments) as ProofRow[])

  return {
    ...result,
    rows: result.rows.map((c) => {
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
    }),
  }
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
