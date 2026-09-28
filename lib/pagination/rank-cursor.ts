import { TEXT_LIMITS } from '@/lib/forms/limits'
import type { SearchParams } from '@/lib/pagination/cursor'
import type { KeysetOrder } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'

// The leaderboard's position: balance desc, display_name asc, id asc, the same order its read uses.
export type RankCursor = { balance: number; name: string; id: string }
export type RankPageParams = { top: RankCursor | null; bottom: RankCursor | null }

// Long enough for the longest valid cursor: 80 code points of JSON-escaped name plus the rest.
const BASE64URL = /^[A-Za-z0-9_-]{1,1000}$/

// profiles.balance is `integer` (int4). A balance outside this range would make the range filter
// reach PostgREST as a literal Postgres can't store, which answers 22003 "out of range for type
// integer" instead of matching no rows -- so it's rejected here, like any other bad cursor, and a
// tampered link falls back to the first page rather than the error page.
const INT4_MAX = 2_147_483_647

// A display name can be any text, so the JSON goes through UTF-8 before btoa, which only takes
// single-byte characters. TextDecoder's fatal mode turns a tampered byte sequence into an error.
function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(raw: string): string {
  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function encodeRankCursor(cursor: RankCursor): string {
  return toBase64Url(JSON.stringify([cursor.balance, cursor.name, cursor.id]))
}

export function decodeRankCursor(raw: string | string[] | undefined | null): RankCursor | null {
  if (typeof raw !== 'string' || !BASE64URL.test(raw)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(raw))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null
  const [balance, name, id] = parsed
  if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance < 0 || balance > INT4_MAX) return null
  if (typeof name !== 'string' || [...name].length > TEXT_LIMITS.displayName) return null
  if (typeof id !== 'string' || !isUuid(id)) return null
  return { balance, name, id }
}

export function readRankPageParams(searchParams: SearchParams, param: string): RankPageParams {
  return { top: decodeRankCursor(searchParams[`${param}_from`]), bottom: decodeRankCursor(searchParams[param]) }
}

// PostgREST reads a double-quoted value up to the next unescaped quote, taking \" and \\ as
// escapes, so any display name reaches the query as a literal and never as filter syntax.
function quote(value: string | number): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// The members after c in the board's order (below) or before it, and c itself when inclusive.
// Unlike keyset.ts these carry no redundant seek bound: profiles has no index in this order, and
// the whole membership is a few hundred rows.
function beside(c: RankCursor, below: boolean, inclusive: boolean): string {
  const balance = below ? 'lt' : 'gt'
  const name = below ? 'gt' : 'lt'
  const id = `${below ? 'gt' : 'lt'}${inclusive ? 'e' : ''}`
  return (
    `or(balance.${balance}.${quote(c.balance)},and(balance.eq.${quote(c.balance)},` +
    `or(display_name.${name}.${quote(c.name)},and(display_name.eq.${quote(c.name)},id.${id}.${quote(c.id)}))))`
  )
}

// Every member ranked ahead of c: the count that fixes the rank a window's first row continues from.
export function aheadOfRankFilter(c: RankCursor): string {
  return beside(c, false, false)
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
