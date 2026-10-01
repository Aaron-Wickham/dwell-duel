import { TEXT_LIMITS } from '@/lib/forms/limits'
import type { SearchParams } from '@/lib/pagination/cursor'
import type { KeysetOrder } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'
import { decodeTextCursor, quote, toBase64Url } from '@/lib/pagination/text-cursor'

// A leaderboard's position: score desc, display_name asc, id asc, the same order its read uses.
// The score is net worth on the main board and the month's profit on This month.
export type RankCursor = { score: number; name: string; id: string }
export type RankPageParams = { top: RankCursor | null; bottom: RankCursor | null }

// Long enough for the longest valid cursor: 80 code points of JSON-escaped name plus the rest.
const MAX_CURSOR = 1000

export function encodeRankCursor(cursor: RankCursor): string {
  return toBase64Url(JSON.stringify([cursor.score, cursor.name, cursor.id]))
}

export function decodeRankCursor(raw: string | string[] | undefined | null): RankCursor | null {
  const parsed = decodeTextCursor(raw, MAX_CURSOR)
  if (!parsed || parsed.length !== 3) return null
  const [score, name, id] = parsed
  // The score is a bigint, so any safe integer is a literal Postgres can store; a month's profit
  // can be negative. Past that range a tampered link falls back to the first page, not an error.
  if (typeof score !== 'number' || !Number.isSafeInteger(score)) return null
  if (typeof name !== 'string' || [...name].length > TEXT_LIMITS.displayName) return null
  if (typeof id !== 'string' || !isUuid(id)) return null
  return { score, name, id }
}

export function readRankPageParams(searchParams: SearchParams, param: string): RankPageParams {
  return { top: decodeRankCursor(searchParams[`${param}_from`]), bottom: decodeRankCursor(searchParams[param]) }
}

// The members after c in the board's order (below) or before it, and c itself when inclusive.
// Unlike keyset.ts these carry no redundant seek bound: the boards are computed rows with no index
// in this order, and the whole membership is a few hundred rows.
function beside(c: RankCursor, below: boolean, inclusive: boolean): string {
  const score = below ? 'lt' : 'gt'
  const name = below ? 'gt' : 'lt'
  const id = `${below ? 'gt' : 'lt'}${inclusive ? 'e' : ''}`
  return (
    `or(score.${score}.${quote(c.score)},and(score.eq.${quote(c.score)},` +
    `or(display_name.${name}.${quote(c.name)},and(display_name.eq.${quote(c.name)},id.${id}.${quote(c.id)}))))`
  )
}

export const RANK_ORDER: KeysetOrder<RankCursor> = {
  range: ({ top, bottom }) => {
    if (top && bottom) return `and(${beside(top, true, true)},${beside(bottom, false, true)})`
    if (bottom) return beside(bottom, false, true)
    if (top) return beside(top, true, true)
    return null
  },
  after: (key) => beside(key, true, false),
  encode: encodeRankCursor,
}
