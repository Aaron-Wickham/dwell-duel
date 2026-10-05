import { TEXT_LIMITS } from '@/lib/forms/limits'
import { isPostgresTimestamp, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetOrder } from '@/lib/pagination/keyset'
import { decodeTextCursor, quote, toBase64Url } from '@/lib/pagination/text-cursor'
import { isUuid } from '@/lib/uuid'

// A position in a list of members sorted by one value (a balance, a net worth, when they joined)
// in either direction, then display_name asc and id asc, the order its read uses. The leaderboard's
// RankCursor is this with the score, descending.
export type ValueKind = 'integer' | 'timestamp'
export type ValueCursor = { value: number | string; name: string; id: string }
export type ValuePageParams = { top: ValueCursor | null; bottom: ValueCursor | null }

// Long enough for the longest valid cursor: 80 code points of JSON-escaped name plus the rest.
const MAX_CURSOR = 1000

export function encodeValueCursor(cursor: ValueCursor): string {
  return toBase64Url(JSON.stringify([cursor.value, cursor.name, cursor.id]))
}

// A value of the wrong kind (a balance cursor on the Joined sort, say) is dropped like any other bad
// cursor, so a tampered or stale link shows the first page rather than an error.
export function decodeValueCursor(raw: string | string[] | undefined | null, kind: ValueKind): ValueCursor | null {
  const parsed = decodeTextCursor(raw, MAX_CURSOR)
  if (!parsed || parsed.length !== 3) return null
  const [value, name, id] = parsed
  if (kind === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null
  } else if (typeof value !== 'string' || !isPostgresTimestamp(value)) {
    return null
  }
  if (typeof name !== 'string' || [...name].length > TEXT_LIMITS.displayName) return null
  if (typeof id !== 'string' || !isUuid(id)) return null
  return { value, name, id }
}

export function readValuePageParams(searchParams: SearchParams, param: string, kind: ValueKind): ValuePageParams {
  return { top: decodeValueCursor(searchParams[`${param}_from`], kind), bottom: decodeValueCursor(searchParams[param], kind) }
}

// The order on `column` (ascending or not), then display_name asc, id asc. Like the leaderboard's
// (rank-cursor.ts), the filters carry no redundant seek bound: the members are computed rows
// (admin_members, the net-worth board) with no index in any of these orders.
export function valueOrder(column: string, ascending: boolean): KeysetOrder<ValueCursor> {
  // The rows after c in the list's order, or before it, and c itself when inclusive.
  function beside(c: ValueCursor, after: boolean, inclusive: boolean): string {
    const value = after === ascending ? 'gt' : 'lt'
    const tie = after ? 'gt' : 'lt'
    return (
      `or(${column}.${value}.${quote(c.value)},and(${column}.eq.${quote(c.value)},` +
      `or(display_name.${tie}.${quote(c.name)},and(display_name.eq.${quote(c.name)},id.${tie}${inclusive ? 'e' : ''}.${quote(c.id)}))))`
    )
  }
  return {
    range: ({ top, bottom }) => {
      if (top && bottom) return `and(${beside(top, true, true)},${beside(bottom, false, true)})`
      if (bottom) return beside(bottom, false, true)
      if (top) return beside(top, true, true)
      return null
    },
    after: (key) => beside(key, true, false),
    encode: encodeValueCursor,
  }
}

// The same order as a comparator, and as an order whose filters are predicates, for a list sorted
// in memory. It compares names as JavaScript does, which can differ from the database's collation, so a
// list read this way must be filtered this way too, never through valueOrder's filters.
export function compareByValue(ascending: boolean) {
  return (a: ValueCursor, b: ValueCursor): number => {
    if (a.value !== b.value) return (a.value < b.value ? -1 : 1) * (ascending ? 1 : -1)
    if (a.name !== b.name) return a.name < b.name ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
}

export type ValuePredicate = (key: ValueCursor) => boolean

export function valueOrderInMemory(ascending: boolean): KeysetOrder<ValueCursor, ValuePredicate> {
  const compare = compareByValue(ascending)
  return {
    range: ({ top, bottom }) => {
      if (!top && !bottom) return null
      return (k) => (!top || compare(k, top) >= 0) && (!bottom || compare(k, bottom) <= 0)
    },
    after: (key) => (k) => compare(k, key) > 0,
    encode: encodeValueCursor,
  }
}
