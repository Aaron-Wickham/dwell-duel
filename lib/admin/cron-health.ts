import type { DbClient } from '@/lib/supabase/database'
import { atLeast, type Role } from '@/lib/auth/roles'
import { reportError } from '@/lib/observability/report'
import { vapidKeys } from '@/lib/push/config'

export const CLOSING_ALERTS_JOB = 'closing-alerts'

// pg_cron calls the route at least every ten minutes (0064), so a warning waits out a couple of
// missed calls rather than flagging one slow start.
export const CLOSING_ALERTS_STALE_MS = 30 * 60 * 1000

// `unknown` is a failed read: the banner says it couldn't check, where a throw would take down every Admin page.
export type ClosingAlertsHealth = { stale: false; unknown?: true } | { stale: true; lastRunAt: string | null }

export function closingAlertsHealth(lastRunAt: string | null, now: number): ClosingAlertsHealth {
  if (lastRunAt !== null && now - Date.parse(lastRunAt) <= CLOSING_ALERTS_STALE_MS) return { stale: false }
  return { stale: true, lastRunAt }
}

// Whether the Admin pages should warn this viewer that closing alerts have stopped. Only admins and
// the owner can act on it (cron_heartbeats is theirs to read, 0061), and without push keys (local
// dev, CI) the schedule sends nothing, so there is nothing to miss.
export async function readClosingAlertsHealth(
  supabase: DbClient,
  role: Role,
  now: number,
  env: Record<string, string | undefined> = process.env,
): Promise<ClosingAlertsHealth> {
  if (!atLeast(role, 'admin') || !vapidKeys(env)) return { stale: false }
  const { data, error } = await supabase.from('cron_heartbeats').select('last_run_at').eq('name', CLOSING_ALERTS_JOB).maybeSingle()
  if (error) {
    reportError('Reading the closing-alerts heartbeat failed', error)
    return { stale: false, unknown: true }
  }
  return closingAlertsHealth(data?.last_run_at ?? null, now)
}
