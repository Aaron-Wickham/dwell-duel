import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { fetchLookups, type EntryMeta, type Lookups } from './list-transactions'

export interface MyCoinEntry {
  id: number
  amount: number
  label: string
  createdAt: string
}

// A member reads their own rows, so this names what happened to them in their words, where the
// admin ledger's buildContext names the movement for someone auditing everyone's.
export function coinLabel(type: string, amount: number, meta: EntryMeta, lookups: Lookups): string {
  const dc = `${Math.abs(amount)} DC`
  const market = meta.market_id ? lookups.markets.get(meta.market_id) : undefined
  const outcome = meta.outcome_id ? lookups.outcomes.get(meta.outcome_id) : undefined
  const onMarket = (text: string) => (market ? `${text} · ${market}` : text)

  switch (type) {
    case 'starting_grant':
      return 'Starting balance'
    case 'bet_placed':
      if (outcome && market) return `Bet ${dc} on ${outcome} · ${market}`
      return market ? `Bet ${dc} on ${market}` : `Bet ${dc}`
    case 'bet_won':
      return market ? `Won ${dc} on ${market}` : `Won ${dc}`
    case 'bet_voided_refund':
      return onMarket('Refund: market voided')
    case 'bet_refunded':
      return onMarket('Refund: nobody picked the winner')
    case 'bet_cancelled':
      return onMarket(outcome ? `Refund: cancelled bet on ${outcome}` : 'Refund: cancelled bet')
    case 'resolution_reversed':
      return onMarket('Payout taken back: result changed')
    case 'parlay_placed':
      return `Parlay ${dc}`
    case 'parlay_won':
      return `Won ${dc} on a parlay`
    case 'parlay_refunded':
      return 'Refund: parlay voided'
    case 'parlay_reversed':
      return 'Parlay payout taken back: result changed'
    case 'task_completed': {
      const task = meta.task_id ? lookups.tasks.get(meta.task_id) : undefined
      return task ? `Task reward: ${task}` : 'Task reward'
    }
    case 'admin_adjustment':
      return meta.reason ? `Adjusted by the owner: ${meta.reason}` : 'Adjusted by the owner'
    default:
      return 'Balance change'
  }
}

const MY_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }
const MY_COLUMNS = 'id, amount, type, meta, created_at'

type MyTransactionRecord = { id: number; amount: number; type: string; meta: EntryMeta | null; created_at: string }

const myKey = (t: { id: number; created_at: string }): Cursor => ({ ts: t.created_at, id: String(t.id) })

// Filtered on profile_id even though RLS already scopes a member to their own rows: an admin's
// RLS lets them read everyone's, and this page is only ever their own. The profile filter plus
// (created_at, id) order is what coin_transactions_profile_created_idx (0048) serves.
function myQuery(supabase: DbClient, userId: string, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('coin_transactions').select(columns).eq('profile_id', userId)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function listMyTransactions(
  supabase: DbClient,
  userId: string,
  page: PageParams,
): Promise<KeysetPage<MyCoinEntry>> {
  const result = await readKeyset(
    page,
    MY_KEYS,
    async (filter, limit) => {
      const { data, error } = await myQuery(supabase, userId, MY_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as MyTransactionRecord[]
    },
    myKey,
    async (filter, limit) => {
      const { data, error } = await myQuery(supabase, userId, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(myKey)
    },
  )

  const metas = result.rows.map((t) => t.meta ?? {})
  const lookups = await fetchLookups(supabase, metas)

  return {
    ...result,
    rows: result.rows.map((t, index) => ({
      id: t.id,
      amount: t.amount,
      label: coinLabel(t.type, t.amount, metas[index], lookups),
      createdAt: t.created_at,
    })),
  }
}
