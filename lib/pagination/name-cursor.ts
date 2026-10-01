import { TEXT_LIMITS } from '@/lib/forms/limits'
import type { SearchParams } from '@/lib/pagination/cursor'
import type { KeysetOrder } from '@/lib/pagination/keyset'
import { decodeTextCursor, quote, toBase64Url } from '@/lib/pagination/text-cursor'
import { isUuid } from '@/lib/uuid'

// A position in an A–Z list of members: display_name asc, id asc, the order its read uses.
export type NameCursor = { name: string; id: string }
export type NamePageParams = { top: NameCursor | null; bottom: NameCursor | null }

// Long enough for the longest valid cursor: 80 code points of JSON-escaped name plus the id.
const MAX_CURSOR = 1000

export function encodeNameCursor(cursor: NameCursor): string {
  return toBase64Url(JSON.stringify([cursor.name, cursor.id]))
}

export function decodeNameCursor(raw: string | string[] | undefined | null): NameCursor | null {
  const parsed = decodeTextCursor(raw, MAX_CURSOR)
  if (!parsed || parsed.length !== 2) return null
  const [name, id] = parsed
  if (typeof name !== 'string' || [...name].length > TEXT_LIMITS.displayName) return null
  if (typeof id !== 'string' || !isUuid(id)) return null
  return { name, id }
}

export function readNamePageParams(searchParams: SearchParams, param: string): NamePageParams {
  return { top: decodeNameCursor(searchParams[`${param}_from`]), bottom: decodeNameCursor(searchParams[param]) }
}

// The members after c in the list's order, or before it, and c itself when inclusive. Like the
// leaderboard's (rank-cursor.ts), these carry no redundant seek bound: the list is admin_members'
// computed rows, which have no index in this order.
function beside(c: NameCursor, after: boolean, inclusive: boolean): string {
  const op = after ? 'gt' : 'lt'
  return `or(display_name.${op}.${quote(c.name)},and(display_name.eq.${quote(c.name)},id.${op}${inclusive ? 'e' : ''}.${quote(c.id)}))`
}

export const NAME_ORDER: KeysetOrder<NameCursor> = {
  range: ({ top, bottom }) => {
    if (top && bottom) return `and(${beside(top, true, true)},${beside(bottom, false, true)})`
    if (bottom) return beside(bottom, false, true)
    if (top) return beside(top, true, true)
    return null
  },
  after: (key) => beside(key, true, false),
  encode: encodeNameCursor,
}
