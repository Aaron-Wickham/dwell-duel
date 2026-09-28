import type { DbClient } from '@/lib/supabase/database'
import type { TaskSummary } from './list-tasks'

export async function getCurrentPeriodKeys(
  supabase: DbClient,
  periods: TaskSummary['period'][],
): Promise<Map<string, string>> {
  const distinct = [...new Set(periods)]
  const result = new Map<string, string>()

  await Promise.all(
    distinct.map(async (period) => {
      const { data, error } = await supabase.rpc('compute_period_key', { p_period: period })
      if (error) throw error
      result.set(period ?? 'once', data)
    }),
  )

  return result
}
