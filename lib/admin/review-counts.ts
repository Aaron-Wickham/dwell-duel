import type { DbClient } from '@/lib/supabase/database'
import type { Role } from '@/lib/auth/roles'
import { atLeast } from '@/lib/auth/roles'
import type { LiveSubscription } from '@/components/live/live-refresh'

export type ReviewCounts = { tasks: number; markets: number }

// What is waiting on the viewer, for the Admin button's badge. my_review_counts (0058) applies the
// roles: another member's task submissions for a reviewer and above, closed markets with no result
// for an admin and above. A plain member has nothing, so it costs them no query.
export async function getReviewCounts(supabase: DbClient, role: Role): Promise<ReviewCounts> {
  if (!atLeast(role, 'reviewer')) return { tasks: 0, markets: 0 }
  const { data, error } = await supabase.rpc('my_review_counts')
  if (error) throw error
  const row = data?.[0]
  return { tasks: Number(row?.tasks ?? 0), markets: Number(row?.markets ?? 0) }
}

// The tables whose changes move the badge, for the layout to keep live. A market closing is only
// the clock passing, so nothing here hears that: the layout also refreshes at the next close.
export function reviewSubscriptions(role: Role): LiveSubscription[] {
  if (atLeast(role, 'admin')) return [{ topic: 'reviews' }, { topic: 'markets' }]
  if (atLeast(role, 'reviewer')) return [{ topic: 'reviews' }]
  return []
}
