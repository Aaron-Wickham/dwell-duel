import type { DbClient } from '@/lib/supabase/database'

export const NOTIFICATION_KINDS = ['resolve_reminders', 'results', 'task_reviews', 'new_markets', 'review_alerts'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]
export type NotificationPrefs = Record<NotificationKind, boolean>

// The column defaults in 0057 and 0058, for a member who has never saved a choice (no row yet).
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  resolve_reminders: true,
  results: true,
  task_reviews: true,
  new_markets: false,
  review_alerts: true,
}

export async function getMyNotificationSettings(
  supabase: DbClient,
  userId: string,
): Promise<{ prefs: NotificationPrefs; endpoints: string[] }> {
  const [prefs, subscriptions] = await Promise.all([
    supabase
      .from('notification_prefs')
      .select('resolve_reminders, results, task_reviews, new_markets, review_alerts')
      .eq('profile_id', userId)
      .maybeSingle(),
    supabase.from('push_subscriptions').select('endpoint').eq('profile_id', userId),
  ])
  if (prefs.error) throw prefs.error
  if (subscriptions.error) throw subscriptions.error
  return {
    prefs: prefs.data ?? DEFAULT_NOTIFICATION_PREFS,
    endpoints: subscriptions.data.map((s) => s.endpoint),
  }
}
