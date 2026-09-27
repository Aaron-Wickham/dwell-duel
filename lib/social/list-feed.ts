import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedEvent, FeedKind } from './describe-event'
import { readKeyset, type KeysetPage } from '@/lib/pagination/keyset'
import type { PageParams } from '@/lib/pagination/cursor'

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

const FEED_COLUMNS = 'id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title'
const FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

function toFeedEvent(r: FeedRow): FeedEvent {
  return {
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
  }
}

export async function listFeed(
  supabase: SupabaseClient,
  opts: { actorId?: string; page: PageParams },
): Promise<KeysetPage<FeedEvent>> {
  const fetchRows = async (filter: string | null, limit: number): Promise<FeedRow[]> => {
    let query = supabase
      .from('activity_feed')
      .select(FEED_COLUMNS)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as FeedRow[]
  }

  const { rows, next, windowed } = await readKeyset<FeedRow>(
    opts.page,
    FEED_KEY_COLUMNS,
    fetchRows,
    (row) => ({ ts: row.occurred_at, id: row.id }),
  )

  return { rows: rows.map(toFeedEvent), next, windowed }
}
