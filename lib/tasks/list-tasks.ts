import type { DbClient } from '@/lib/supabase/database'

export interface TaskSummary {
  id: string
  title: string
  description: string | null
  rewardAmount: number
  isRepeatable: boolean
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  isActive: boolean
  proofRequired: boolean
}

export async function listTasks(supabase: DbClient): Promise<TaskSummary[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, reward_amount, is_repeatable, period, is_active, proof_required')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    rewardAmount: t.reward_amount,
    isRepeatable: t.is_repeatable,
    period: t.period as TaskSummary['period'], // a CHECK-constrained text column
    isActive: t.is_active,
    proofRequired: t.proof_required,
  }))
}

// The lowest and highest reward among active tasks, for Home's nudge at 0 DC (#260), or null when
// there are none. A failed read is null too: the nudge then just says to earn more with Tasks,
// rather than taking Home down for a member who has nothing left.
export async function getTaskRewardRange(supabase: DbClient): Promise<{ min: number; max: number } | null> {
  const end = (ascending: boolean) =>
    supabase.from('tasks').select('reward_amount').eq('is_active', true).order('reward_amount', { ascending }).limit(1).maybeSingle()
  try {
    const [low, high] = await Promise.all([end(true), end(false)])
    if (low.error || high.error || !low.data || !high.data) return null
    return { min: low.data.reward_amount, max: high.data.reward_amount }
  } catch {
    return null
  }
}
