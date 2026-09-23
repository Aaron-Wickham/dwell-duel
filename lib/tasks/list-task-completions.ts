import type { SupabaseClient } from '@supabase/supabase-js'

export interface MyCompletion {
  taskId: string
  status: 'pending' | 'approved' | 'rejected'
  periodKey: string
  rewardAmount: number
}

export async function listMyTaskCompletions(supabase: SupabaseClient, profileId: string): Promise<MyCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, status, period_key, reward_amount')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status,
    periodKey: c.period_key,
    rewardAmount: c.reward_amount,
  }))
}

export interface PendingCompletion {
  id: string
  taskTitle: string
  submitterName: string
  submittedAt: string
}

export async function listPendingTaskCompletions(supabase: SupabaseClient): Promise<PendingCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('id, submitted_at, tasks(title), profiles(display_name)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((c) => {
    const task = c.tasks as unknown as { title: string } | null
    const profile = c.profiles as unknown as { display_name: string } | null
    return {
      id: c.id,
      taskTitle: task?.title ?? 'Unknown task',
      submitterName: profile?.display_name ?? 'Unknown member',
      submittedAt: c.submitted_at,
    }
  })
}
