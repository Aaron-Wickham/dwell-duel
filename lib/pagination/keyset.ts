import { PAGE_SIZE, WINDOW_CAP, encodeCursor, type Cursor, type NextPage, type PageParams } from '@/lib/pagination/cursor'

// isId guards the id's column type: Postgres rejects `id.lt."abc"` on a bigint column with an
// error, so a cursor whose id can't be that column's is dropped, like any other bad cursor.
export type KeyColumns = { ts: string; id: string; isId?: (id: string) => boolean }
export type KeysetPage<T> = { rows: T[]; next: NextPage | null; windowed: boolean }

const BIGINT_ID = /^\d{1,18}$/

export function isBigintId(id: string): boolean {
  return BIGINT_ID.test(id)
}

// Every leaf is a plain `<ts>.op."value"` term, plus a matching plain bound on <ts> alongside the
// (ts, id) tiebreak OR. A pure-OR filter with no such bound is known from EXPLAIN review to get
// only a Filter on the (ts desc, id desc) index, walking the whole table; the bounded form here is
// proven to get an Index Cond instead (tests/db/data-layer-indexes.test.ts). The bound is redundant
// with the OR itself — the `lt`/`eq` tiebreak implies `lte`, and the `gt`/`eq` tiebreak implies
// `gte` — but it's what gives Postgres something to seek by.
function atOrOlder(cols: KeyColumns, c: Cursor): string {
  return `and(${cols.ts}.lte."${c.ts}",or(${cols.ts}.lt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.lte."${c.id}")))`
}

function atOrNewer(cols: KeyColumns, c: Cursor): string {
  return `and(${cols.ts}.gte."${c.ts}",or(${cols.ts}.gt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.gte."${c.id}")))`
}

// Every value is quoted, and a validated cursor can't contain a quote (see decodeCursor).
export function rangeFilter(cols: KeyColumns, page: PageParams): string | null {
  const { top, bottom } = page
  if (top && bottom) return `and(${atOrNewer(cols, bottom)},${atOrOlder(cols, top)})`
  if (bottom) return atOrNewer(cols, bottom)
  if (top) return atOrOlder(cols, top)
  return null
}

export function olderThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.lte."${cursor.ts}",or(${cols.ts}.lt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.lt."${cursor.id}")))`
}

export function newerThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.gte."${cursor.ts}",or(${cols.ts}.gt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.gt."${cursor.id}")))`
}

export async function readKeyset<Row>(
  rawPage: PageParams,
  cols: KeyColumns,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Cursor,
): Promise<KeysetPage<Row>> {
  const valid = (c: Cursor | null) => (c && (!cols.isId || cols.isId(c.id)) ? c : null)
  const page: PageParams = { top: valid(rawPage.top), bottom: valid(rawPage.bottom) }
  const windowed = page.top !== null

  const rows = await fetchRows(rangeFilter(cols, page), page.bottom ? WINDOW_CAP : PAGE_SIZE)
  if (rows.length === 0 || (page.bottom === null && rows.length < PAGE_SIZE)) return { rows, next: null, windowed }

  // "Show more" points at the 50th row past the last one shown, so the read needs those rows'
  // keys. Probing from the last row returned, not from the cursor, means rows that arrived at the
  // top and pushed the range past the cap are picked up here instead of skipped.
  const probe = await fetchRows(olderThanFilter(cols, keyOf(rows[rows.length - 1])), PAGE_SIZE)
  if (probe.length === 0) return { rows, next: null, windowed }
  if (rows.length + probe.length > WINDOW_CAP) {
    return { rows, next: { kind: 'window', cursor: encodeCursor(keyOf(probe[0])) }, windowed }
  }
  return { rows, next: { kind: 'extend', cursor: encodeCursor(keyOf(probe[probe.length - 1])) }, windowed }
}
