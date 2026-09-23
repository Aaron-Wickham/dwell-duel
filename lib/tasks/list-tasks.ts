import type { SupabaseClient } from '@supabase/supabase-js'

export interface TaskSummary {
  id: string
  title: string
  description: string | null
  rewardAmount: number
  isRepeatable: boolean
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  isActive: boolean
}

export async function listTasks(supabase: SupabaseClient): Promise<TaskSummary[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, reward_amount, is_repeatable, period, is_active')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    rewardAmount: t.reward_amount,
    isRepeatable: t.is_repeatable,
    period: t.period,
    isActive: t.is_active,
  }))
}
