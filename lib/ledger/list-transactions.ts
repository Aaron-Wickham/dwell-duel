import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
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
  bet_cancelled: 'Bet cancelled',
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
async function fetchMarketTitles(supabase: DbClient, ids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const results = await Promise.all(chunk(ids, IN_CHUNK).map((part) => supabase.from('markets').select('id, title').in('id', part)))
  for (const { data, error } of results) {
    if (error) throw error
    for (const m of data ?? []) titles.set(m.id as string, m.title as string)
  }
  return titles
}

async function fetchOutcomeLabels(supabase: DbClient, ids: string[]): Promise<Map<string, string>> {
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

async function fetchTaskTitles(supabase: DbClient, ids: string[]): Promise<Map<string, string>> {
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

// The titles and labels a page of ledger rows names, one chunked lookup per table. Shared by the
// admin ledger and a member's own coin history, which word their rows differently.
export async function fetchLookups(supabase: DbClient, metas: EntryMeta[]): Promise<Lookups> {
  const ids = (key: 'market_id' | 'outcome_id' | 'task_id') => [
    ...new Set(metas.map((m) => m[key]).filter((v): v is string => Boolean(v))),
  ]
  const [markets, outcomes, tasks] = await Promise.all([
    fetchMarketTitles(supabase, ids('market_id')),
    fetchOutcomeLabels(supabase, ids('outcome_id')),
    fetchTaskTitles(supabase, ids('task_id')),
  ])
  return { markets, outcomes, tasks }
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
const LEDGER_COLUMNS = 'id, profile_id, amount, type, meta, created_at, profiles(display_name)'

type TransactionRecord = {
  id: number
  profile_id: string
  amount: number
  type: string
  meta: EntryMeta | null
  created_at: string
  profiles: { display_name: string } | null
}

const ledgerKey = (t: { id: number; created_at: string }): Cursor => ({ ts: t.created_at, id: String(t.id) })

// The range read and its key probe share one builder, so the two can't drift apart on order. Its column list is a runtime string, so
// the generated types can't follow it, and each reader casts its rows. A member filter reads
// through coin_transactions_profile_created_idx (0048), the same index a member's own history uses.
function ledgerQuery(supabase: DbClient, columns: string, filter: string | null, limit: number, memberId?: string) {
  let query = supabase.from('coin_transactions').select(columns)
  if (memberId) query = query.eq('profile_id', memberId)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

async function toEntries(supabase: DbClient, rows: TransactionRecord[]): Promise<LedgerEntry[]> {
  const metas = rows.map((t) => t.meta ?? {})
  const lookups = await fetchLookups(supabase, metas)
  return rows.map((t, index) => ({
    id: t.id,
    profileId: t.profile_id,
    memberName: t.profiles?.display_name ?? 'Unknown member',
    amount: t.amount,
    type: TYPE_LABELS[t.type] ?? t.type,
    context: buildContext(t.type, metas[index], lookups),
    createdAt: t.created_at,
  }))
}

// Every coin movement, or one member's when `memberId` is given (Admin › Ledger's ?member=).
export async function listAllTransactions(
  supabase: DbClient,
  page: PageParams,
  memberId?: string,
): Promise<KeysetPage<LedgerEntry>> {
  const result = await readKeyset(
    page,
    LEDGER_KEYS,
    async (filter, limit) => {
      const { data, error } = await ledgerQuery(supabase, LEDGER_COLUMNS, filter, limit, memberId)
      if (error) throw error
      return (data ?? []) as unknown as TransactionRecord[]
    },
    ledgerKey,
    async (filter, limit) => {
      const { data, error } = await ledgerQuery(supabase, 'id, created_at', filter, limit, memberId)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(ledgerKey)
    },
  )
  return { ...result, rows: await toEntries(supabase, result.rows) }
}

// A member's latest few movements, for their Admin page.
export async function listMemberTransactions(supabase: DbClient, memberId: string, limit: number): Promise<LedgerEntry[]> {
  const { data, error } = await ledgerQuery(supabase, LEDGER_COLUMNS, null, limit, memberId)
  if (error) throw error
  return toEntries(supabase, (data ?? []) as unknown as TransactionRecord[])
}
