import { CircleAlert } from 'lucide-react'
import { Message } from '@/components/ui/message'
import type { ClosingAlertsHealth } from '@/lib/admin/cron-health'
import { relativeTime } from '@/lib/social/relative-time'

// Only the owner can reach Supabase and the workflows, so only the owner gets the steps to fix it;
// everyone else is told it doesn't touch members and who to tell (ADM-2).
export function ClosingAlertsWarning({ health, now, isOwner }: { health: ClosingAlertsHealth; now: number; isOwner: boolean }) {
  if (!health.stale && health.unknown) {
    return (
      <Message tone="gold" icon={CircleAlert}>
        Couldn’t check whether closing alerts are running. The rest of Admin still works; reload to check again.
      </Message>
    )
  }
  if (!health.stale) return null
  const when = health.lastRunAt ? `last ran ${relativeTime(health.lastRunAt, now)}` : 'haven’t run yet'
  if (!isOwner) {
    return (
      <Message tone="gold" icon={CircleAlert}>
        Closing alerts {when}. Members aren’t affected and the daily alert still goes out. Tell the owner.
      </Message>
    )
  }
  return (
    <Message tone="gold" icon={CircleAlert}>
      Closing alerts {when}. The timer that sends them may have stopped: check the closing-alerts job in
      Supabase (Integrations › Cron) and its Vault secrets, and the Closing alerts workflow, its
      backup. Until one runs, the daily cron is the only sender.
    </Message>
  )
}
