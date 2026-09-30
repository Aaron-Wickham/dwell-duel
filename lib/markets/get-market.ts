import type { MarketKind } from '@/lib/markets/kind'
import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { avatarUrl } from '@/lib/profile/avatar'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'

export interface MarketDetail {
  id: string
  title: string
  description: string | null
  kind: MarketKind
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  createdAt: string
  seedPerOutcome: number
  // An over/under's line, and the actual result it resolved on.
  line: number | null
  actualValue: number | null
  editedAt: string | null
  createdBy: string
  creatorName: string
  currentResolutionId: string | null
  resolvedOutcomeId: string | null
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  // When it stopped being open (0066): the first resolution or the void; null while open.
  settledAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

export interface MarketBet {
  id: number
  outcomeId: string
  amount: number
  createdAt: string
  profileId: string
  bettorName: string
  bettorAvatarSrc: string | null
}

export async function getMarket(supabase: DbClient, marketId: string): Promise<MarketDetail | null> {
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, description, kind, status, close_at, created_at, settled_at, created_by, current_resolution_id, seed_per_outcome, line, edited_at, creator:profiles(display_name), market_outcomes(id, label, pool_total), current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at, actual_value)',
    )
    .eq('id', marketId)
    // Rows come back with no default order, and colours are assigned by position for
    // multiple-choice markets, so pin a stable order: insertion time, then label to
    // break the tie (create_market inserts every outcome in one transaction).
    .order('created_at', { referencedTable: 'market_outcomes' })
    .order('label', { referencedTable: 'market_outcomes' })
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const outcomes = (data.market_outcomes ?? []).map((o: { id: string; label: string; pool_total: number }) => ({
    id: o.id,
    label: o.label,
    poolTotal: o.pool_total,
  }))

  // The embed above replaces a second round trip to market_resolutions: current_resolution_id
  // is a to-one foreign key on markets itself, so PostgREST hands back one object (or null),
  // never an array.
  const resolution = data.current_resolution
  const resolvedOutcomeLabel = resolution ? (outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null
  const resolvedAt = resolution?.resolved_at ?? null

  const creator = data.creator

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    // Text columns with CHECK constraints (0043, 0001), so the generated types say only string.
    kind: data.kind as MarketDetail['kind'],
    status: data.status as MarketDetail['status'],
    closeAt: data.close_at,
    createdAt: data.created_at,
    seedPerOutcome: data.seed_per_outcome,
    line: data.line,
    actualValue: resolution?.actual_value ?? null,
    editedAt: data.edited_at,
    createdBy: data.created_by,
    creatorName: creator?.display_name ?? 'Unknown member',
    currentResolutionId: data.current_resolution_id,
    resolvedOutcomeId: resolution?.outcome_id ?? null,
    resolvedOutcomeLabel,
    resolvedAt,
    settledAt: data.settled_at,
    outcomes,
  }
}

const BET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }
const BET_COLUMNS = 'id, outcome_id, amount, created_at, profile_id, profiles(display_name, avatar_path)'

type BetRow = {
  id: number
  outcome_id: string
  amount: number
  created_at: string
  profile_id: string
  profiles: { display_name: string; avatar_path: string | null } | null
}

const betKey = (b: { id: number; created_at: string }): Cursor => ({ ts: b.created_at, id: String(b.id) })

// The range read and its key probe share one builder, so the two can't drift apart on filters. Its column list is a runtime string, so
// the generated types can't follow it, and each reader casts its rows.
function betsQuery(supabase: DbClient, marketId: string, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('bets').select(columns).eq('market_id', marketId)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function getMarketBets(supabase: DbClient, marketId: string, page: PageParams): Promise<KeysetPage<MarketBet>> {
  const result = await readKeyset(
    page,
    BET_KEYS,
    async (filter, limit) => {
      const { data, error } = await betsQuery(supabase, marketId, BET_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as BetRow[]
    },
    betKey,
    async (filter, limit) => {
      const { data, error } = await betsQuery(supabase, marketId, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(betKey)
    },
  )

  return {
    ...result,
    rows: result.rows.map((b) => ({
      id: b.id,
      outcomeId: b.outcome_id,
      amount: b.amount,
      createdAt: b.created_at,
      profileId: b.profile_id,
      bettorName: b.profiles?.display_name ?? 'Unknown member',
      bettorAvatarSrc: avatarUrl(b.profiles?.avatar_path),
    })),
  }
}
