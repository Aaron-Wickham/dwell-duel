import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedEvent, FeedKind } from './describe-event'

export const FEED_LIMIT = 50

interface FeedRow {
  id: string
  kind: FeedKind
  occurred_at: string
  actor_id: string
  actor_name: string
  market_id: string | null
  market_title: string | null
  outcome_label: string | null
  amount: number | null
  leg_count: number | null
  task_title: string | null
}

export async function listFeed(supabase: SupabaseClient, opts?: { actorId?: string }): Promise<FeedEvent[]> {
  let query = supabase
    .from('activity_feed')
    .select('id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_LIMIT)
  if (opts?.actorId) query = query.eq('actor_id', opts.actorId)

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as FeedRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    marketId: r.market_id,
    marketTitle: r.market_title,
    outcomeLabel: r.outcome_label,
    amount: r.amount,
    legCount: r.leg_count,
    taskTitle: r.task_title,
  }))
}
