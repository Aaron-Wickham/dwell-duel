import type { DbClient } from '@/lib/supabase/database'

// The signed-in member's current streak on each repeating task, by task id (0054). A task with
// no live streak has no entry.
export async function getMyTaskStreaks(supabase: DbClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('my_task_streaks')
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.task_id, r.streak]))
}
