import type { SupabaseClient } from '@supabase/supabase-js'

export interface LedgerEntry {
  id: number
  memberName: string
  amount: number
  type: string
  reason: string | null
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
}

export async function listAllTransactions(supabase: SupabaseClient): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('id, amount, type, meta, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error

  return (data ?? []).map((t) => {
    const profile = t.profiles as unknown as { display_name: string } | null
    const meta = t.meta as { reason?: string }
    return {
      id: t.id,
      memberName: profile?.display_name ?? 'Unknown member',
      amount: t.amount,
      type: TYPE_LABELS[t.type] ?? t.type,
      reason: t.type === 'admin_adjustment' ? (meta.reason ?? null) : null,
      createdAt: t.created_at,
    }
  })
}
