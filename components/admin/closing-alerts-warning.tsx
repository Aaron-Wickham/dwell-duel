import { CircleAlert } from 'lucide-react'
import { Message } from '@/components/ui/message'
import type { ClosingAlertsHealth } from '@/lib/admin/cron-health'
import { relativeTime } from '@/lib/social/relative-time'

export function ClosingAlertsWarning({ health, now }: { health: ClosingAlertsHealth; now: number }) {
  if (!health.stale) return null
  const when = health.lastRunAt ? `last ran ${relativeTime(health.lastRunAt, now)}` : 'haven’t run yet'
  return (
    <Message tone="gold" icon={CircleAlert}>
      Closing alerts {when}. The timer that sends them may have stopped: check the closing-alerts job in
      Supabase (Integrations › Cron) and its Vault secrets, and the Closing alerts workflow, its
      backup. Until one runs, the daily cron is the only sender.
    </Message>
  )
}
