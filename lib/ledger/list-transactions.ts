import type { SupabaseClient } from '@supabase/supabase-js'
import type { PageParams } from '@/lib/pagination/cursor'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'

export interface LedgerEntry {
  id: number
  profileId: string
  memberName: string
  amount: number
  type: string
  context: string
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  bet_placed: 'Bet placed',
  bet_won: 'Bet won',
  bet_refunded: 'Bet refunded',
  bet_voided_refund: 'Market voided',
  resolution_reversed: 'Resolution reversed',
  task_completed: 'Task reward',
  admin_adjustment: 'Admin adjustment',
  starting_grant: 'Starting grant',
  parlay_placed: 'Parlay placed',
  parlay_won: 'Parlay won',
  parlay_refunded: 'Parlay refunded',
  parlay_reversed: 'Parlay reversed',
}

export interface EntryMeta {
  market_id?: string
  outcome_id?: string
  task_id?: string
  reason?: string
}

// Three small `in (...)` lookups -- kept as literal `.select()` calls (not one
// helper taking a column name) because supabase-js parses the select string's
// type at compile time, so a templated column name can't be typed the same way.
// Each is split into chunks of IN_CHUNK ids, so a 500-row window never builds a
// URL that grows with the rows shown.
async function fetchMarketTitles(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const results = await Promise.all(chunk(ids, IN_CHUNK).map((part) => supabase.from('markets').select('id, title').in('id', part)))
  for (const { data, error } of results) {
    if (error) throw error
    for (const m of data ?? []) titles.set(m.id as string, m.title as string)
  }
  return titles
}

async function fetchOutcomeLabels(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const results = await Promise.all(
    chunk(ids, IN_CHUNK).map((part) => supabase.from('market_outcomes').select('id, label').in('id', part)),
  )
  for (const { data, error } of results) {
    if (error) throw error
    for (const o of data ?? []) labels.set(o.id as string, o.label as string)
  }
  return labels
}

async function fetchTaskTitles(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const results = await Promise.all(chunk(ids, IN_CHUNK).map((part) => supabase.from('tasks').select('id, title').in('id', part)))
  for (const { data, error } of results) {
    if (error) throw error
    for (const t of data ?? []) titles.set(t.id as string, t.title as string)
  }
  return titles
}

export interface Lookups {
  markets: Map<string, string>
  outcomes: Map<string, string>
  tasks: Map<string, string>
}

// Every other type's context is its label, plus ": {market title}" when the row has a
// market_id (e.g. a voided-market refund) -- the specific movements below read differently
// enough (different wording, or no market involved at all) that they need their own copy.
// Exported (and kept pure -- no supabase client) so its fallback branches get direct unit
// coverage instead of only being reachable through a DB-backed listAllTransactions test.
export function buildContext(type: string, meta: EntryMeta, lookups: Lookups): string {
  const label = TYPE_LABELS[type] ?? type
  const marketTitle = meta.market_id ? lookups.markets.get(meta.market_id) : undefined

  switch (type) {
    case 'task_completed': {
      const taskTitle = meta.task_id ? lookups.tasks.get(meta.task_id) : undefined
      return taskTitle ? `Task approved: ${taskTitle}` : label
    }
    case 'parlay_won':
      return 'Parlay won'
    case 'parlay_placed':
      return 'Parlay placed'
    case 'bet_won':
      return marketTitle ? `Bet won: ${marketTitle}` : label
    case 'admin_adjustment':
      return meta.reason ? `Admin adjustment — “${meta.reason}”` : label
    case 'bet_placed': {
      const outcomeLabel = meta.outcome_id ? lookups.outcomes.get(meta.outcome_id) : undefined
      return marketTitle && outcomeLabel ? `Bet on ${outcomeLabel} in ${marketTitle}` : label
    }
    case 'starting_grant':
      return 'Starting grant'
    default:
      return marketTitle ? `${label}: ${marketTitle}` : label
  }
}

const LEDGER_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }

export async function listAllTransactions(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<LedgerEntry>> {
  const result = await readKeyset(
    page,
    LEDGER_KEYS,
    async (filter, limit) => {
      let query = supabase.from('coin_transactions').select('id, profile_id, amount, type, meta, created_at, profiles(display_name)')
      if (filter) query = query.or(filter)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    (t) => ({ ts: t.created_at, id: String(t.id) }),
  )

  const rows = result.rows
  const metas = rows.map((t) => (t.meta ?? {}) as EntryMeta)

  const marketIds = [...new Set(metas.map((m) => m.market_id).filter((v): v is string => Boolean(v)))]
  const outcomeIds = [...new Set(metas.map((m) => m.outcome_id).filter((v): v is string => Boolean(v)))]
  const taskIds = [...new Set(metas.map((m) => m.task_id).filter((v): v is string => Boolean(v)))]

  const [markets, outcomes, tasks] = await Promise.all([
    fetchMarketTitles(supabase, marketIds),
    fetchOutcomeLabels(supabase, outcomeIds),
    fetchTaskTitles(supabase, taskIds),
  ])
  const lookups: Lookups = { markets, outcomes, tasks }

  return {
    ...result,
    rows: rows.map((t, index) => {
      const profile = t.profiles as unknown as { display_name: string } | null
      return {
        id: t.id,
        profileId: t.profile_id,
        memberName: profile?.display_name ?? 'Unknown member',
        amount: t.amount,
        type: TYPE_LABELS[t.type] ?? t.type,
        context: buildContext(t.type, metas[index], lookups),
        createdAt: t.created_at,
      }
    }),
  }
}
