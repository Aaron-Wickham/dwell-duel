import type { DbClient } from '@/lib/supabase/database'

// supabase/migrations/0052_economy_panel.sql: economy_summary's one row. bigint columns are
// read through Number(), as my_at_stake's are, in case PostgREST hands one back as a string.
export interface EconomySummaryRow {
  month_start: string
  month_end: string
  balances: number | string
  bets_at_stake: number | string
  parlays_at_stake: number | string
  starting_grants_added: number | string
  task_rewards_added: number | string
  seed_payouts_added: number | string
  seed_payouts_removed: number | string
  house_parlays_added: number | string
  house_parlays_removed: number | string
  owner_adjustments_added: number | string
  owner_adjustments_removed: number | string
  all_time_added: number | string
  all_time_removed: number | string
  unclassified: number | string
}

export interface EconomySource {
  key: 'starting_grants' | 'task_rewards' | 'seed_payouts' | 'house_parlays' | 'owner_adjustments'
  label: string
  added: number
  // null where the source can only ever add.
  removed: number | null
}

export interface EconomySummary {
  monthStart: string
  monthEnd: string
  balances: number
  betsAtStake: number
  parlaysAtStake: number
  inCirculation: number
  sources: EconomySource[]
  monthAdded: number
  monthRemoved: number
  // Everything ever added less everything ever removed, minus what's in circulation: 0 when the
  // ledger reconciles.
  discrepancy: number
  unclassified: number
}

export function toEconomySummary(row: EconomySummaryRow): EconomySummary {
  const n = (v: number | string) => Number(v)
  const sources: EconomySource[] = [
    { key: 'starting_grants', label: 'Starting grants', added: n(row.starting_grants_added), removed: null },
    { key: 'task_rewards', label: 'Task rewards', added: n(row.task_rewards_added), removed: null },
    {
      key: 'seed_payouts',
      label: 'Seed payouts',
      added: n(row.seed_payouts_added),
      removed: n(row.seed_payouts_removed),
    },
    {
      key: 'house_parlays',
      label: 'House-paid parlays',
      added: n(row.house_parlays_added),
      removed: n(row.house_parlays_removed),
    },
    {
      key: 'owner_adjustments',
      label: 'Owner adjustments',
      added: n(row.owner_adjustments_added),
      removed: n(row.owner_adjustments_removed),
    },
  ]
  const inCirculation = n(row.balances) + n(row.bets_at_stake) + n(row.parlays_at_stake)
  return {
    monthStart: row.month_start,
    monthEnd: row.month_end,
    balances: n(row.balances),
    betsAtStake: n(row.bets_at_stake),
    parlaysAtStake: n(row.parlays_at_stake),
    inCirculation,
    sources,
    monthAdded: sources.reduce((sum, s) => sum + s.added, 0),
    monthRemoved: sources.reduce((sum, s) => sum + (s.removed ?? 0), 0),
    discrepancy: n(row.all_time_added) - n(row.all_time_removed) - inCirculation,
    unclassified: n(row.unclassified),
  }
}

// The month is the one `now` falls in, in America/New_York; the RPC works out its bounds.
export async function readEconomySummary(supabase: DbClient, now: Date = new Date()): Promise<EconomySummary> {
  const { data, error } = await supabase.rpc('economy_summary', { p_month_start: now.toISOString() }).single()
  if (error) throw error
  return toEconomySummary(data)
}

// "September 2026": month_start is Eastern midnight on the 1st, so it's read in that zone.
export function monthLabel(monthStart: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' }).format(
    new Date(monthStart),
  )
}
