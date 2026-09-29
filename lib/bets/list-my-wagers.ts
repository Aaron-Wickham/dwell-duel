import type { DbClient } from '@/lib/supabase/database'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { PARLAY_COLUMNS, toParlayView, type ParlayRow, type ParlayView } from '@/lib/parlays/list-parlays'
import { BET_COLUMNS, toMyBet, type BetRow, type MyBet } from './list-my-bets'

export type WagerBucket = 'open' | 'settled'

// `key` is the my_wagers id ('bet:12', 'parlay:<uuid>'): unique across both kinds, and the
// list's row id for "Show more".
export type Wager = { kind: 'bet'; key: string; bet: MyBet } | { kind: 'parlay'; key: string; parlay: ParlayView }

const WAGER_ID = /^(bet:\d{1,18}|parlay:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
const WAGER_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: (id) => WAGER_ID.test(id) }

type KeyRow = { id: string; created_at: string }
const keyOf = (w: KeyRow): Cursor => ({ ts: w.created_at, id: w.id })

async function fetchBets(supabase: DbClient, ids: number[]): Promise<Map<number, BetRow>> {
  const rows = new Map<number, BetRow>()
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase.from('bets').select(BET_COLUMNS).in('id', part)
    if (error) throw error
    for (const row of (data ?? []) as BetRow[]) rows.set(row.id, row)
  }
  return rows
}

async function fetchParlays(supabase: DbClient, ids: string[]): Promise<Map<string, ParlayRow>> {
  const rows = new Map<string, ParlayRow>()
  for (const part of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase.from('parlays').select(PARLAY_COLUMNS).in('id', part)
    if (error) throw error
    for (const row of (data ?? []) as ParlayRow[]) rows.set(row.id, row)
  }
  return rows
}

// One keyset page of the member's solo bets and parlays, newest first. The page is read from
// my_wagers (0044) as keys only, then the bets and parlays it names are fetched by id. A bet
// cancelled between the two reads is simply left out.
export async function listMyWagers(
  supabase: DbClient,
  userId: string,
  bucket: WagerBucket,
  page: PageParams,
): Promise<KeysetPage<Wager>> {
  const keys = await readKeyset(
    page,
    WAGER_KEYS,
    async (filter, limit) => {
      let query = supabase.from('my_wagers').select('id, created_at').eq('profile_id', userId).eq('bucket', bucket)
      if (filter) query = query.or(filter)
      const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
      if (error) throw error
      return (data ?? []) as KeyRow[]
    },
    keyOf,
  )

  const betIds: number[] = []
  const parlayIds: string[] = []
  for (const { id } of keys.rows) {
    if (id.startsWith('bet:')) betIds.push(Number(id.slice(4)))
    else parlayIds.push(id.slice(7))
  }
  const [bets, parlays] = await Promise.all([fetchBets(supabase, betIds), fetchParlays(supabase, parlayIds)])

  const now = Date.now()
  const rows: Wager[] = []
  for (const { id } of keys.rows) {
    if (id.startsWith('bet:')) {
      const bet = bets.get(Number(id.slice(4)))
      if (bet) rows.push({ kind: 'bet', key: id, bet: toMyBet(bet, now) })
    } else {
      const parlay = parlays.get(id.slice(7))
      if (parlay) rows.push({ kind: 'parlay', key: id, parlay: toParlayView(parlay, now) })
    }
  }
  return { ...keys, rows }
}
