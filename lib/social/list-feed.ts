import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedEvent, FeedKind } from './describe-event'
import { readKeyset, type KeysetPage } from '@/lib/pagination/keyset'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'

interface FeedRow {
  id: string
  kind: FeedKind
  occurred_at: string
  actor_id: string
  market_id: string | null
  amount: number | null
  actor: { display_name: string } | null
  market: { title: string } | null
  outcome: { label: string } | null
  task_completion: { task: { title: string } | null } | null
  parlay: { parlay_legs: { id: string }[] } | null
}

// Names, labels, the task title and the parlay leg count are joined at read time through
// PostgREST embeds, not stored on activity_events: every one of these foreign keys (actor_id,
// market_id, outcome_id, task_completion_id, parlay_id) has exactly one relationship to embed
// through, so no `!fkey` disambiguation is needed. actor_id is not null, but the actor embed is
// still `!inner`, matching activity_feed's plain join on profiles: a row whose actor a viewer
// can't see (RLS) is dropped, the same as the view never having a row to join in the first place,
// instead of surfacing with an empty actorName. parlay_legs is capped at 6 rows per parlay
// (MAX_PICKS, lib/parlays/odds.ts), so this never grows with the size of the table.
const FEED_COLUMNS =
  'id, kind, occurred_at, actor_id, market_id, amount, ' +
  'actor:profiles!inner(display_name), market:markets(title), outcome:market_outcomes(label), ' +
  'task_completion:task_completions(task:tasks(title)), parlay:parlays(parlay_legs(id))'
const FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

const feedKey = (r: { id: string; occurred_at: string }): Cursor => ({ ts: r.occurred_at, id: r.id })

function toFeedEvent(r: FeedRow): FeedEvent {
  return {
    id: r.id,
    kind: r.kind,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorName: r.actor?.display_name ?? '',
    marketId: r.market_id,
    marketTitle: r.market?.title ?? null,
    outcomeLabel: r.outcome?.label ?? null,
    amount: r.amount,
    legCount: r.parlay ? r.parlay.parlay_legs.length : null,
    taskTitle: r.task_completion?.task?.title ?? null,
  }
}

export async function listFeed(
  supabase: SupabaseClient,
  opts: { actorId?: string; page: PageParams },
): Promise<KeysetPage<FeedEvent>> {
  // The range read and its key probe share one builder, so the two can't drift apart on filters.
  const feedQuery = (columns: string, filter: string | null, limit: number) => {
    let query = supabase
      .from('activity_events')
      .select(columns)
      .is('hidden_at', null)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)
    return query
  }

  const { rows, next, windowed } = await readKeyset<FeedRow>(
    opts.page,
    FEED_KEY_COLUMNS,
    async (filter, limit) => {
      const { data, error } = await feedQuery(FEED_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as FeedRow[]
    },
    feedKey,
    // No actor embed here: activity_events and profiles are both readable exactly when
    // is_invited(), and actor_id is a not-null foreign key, so the `!inner` join above never
    // drops a row this probe counts.
    async (filter, limit) => {
      const { data, error } = await feedQuery('id, occurred_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: string; occurred_at: string }[]).map(feedKey)
    },
  )

  return { rows: rows.map(toFeedEvent), next, windowed }
}
