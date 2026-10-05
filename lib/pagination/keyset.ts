import { PAGE_SIZE, WINDOW_CAP, encodeCursor, type Cursor, type NextPage, type PageParams } from '@/lib/pagination/cursor'

// isId guards the id's column type: Postgres rejects `id.lt."abc"` on a bigint column with an
// error, so a cursor whose id can't be that column's is dropped, like any other bad cursor.
// `ascending` lists earliest first (the Open markets list, soonest to close); the default is newest
// first. Either way `top` is where a window starts and `bottom` where an extended range ends.
export type KeyColumns = { ts: string; id: string; isId?: (id: string) => boolean; ascending?: boolean }
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
  const fromTop = cols.ascending ? atOrNewer : atOrOlder
  const toBottom = cols.ascending ? atOrOlder : atOrNewer
  if (top && bottom) return `and(${toBottom(cols, bottom)},${fromTop(cols, top)})`
  if (bottom) return toBottom(cols, bottom)
  if (top) return fromTop(cols, top)
  return null
}

export function olderThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.lte."${cursor.ts}",or(${cols.ts}.lt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.lt."${cursor.id}")))`
}

export function newerThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.gte."${cursor.ts}",or(${cols.ts}.gt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.gt."${cursor.id}")))`
}

// How a list's keys become PostgREST filters. `range` is every row from `bottom` (where an
// extended range ends) up to `top` (where a fresh window starts), both inclusive and either
// optional; `after` is every row strictly after a key in the list's order.
export type KeysetOrder<Key> = {
  range: (page: { top: Key | null; bottom: Key | null }) => string | null
  after: (key: Key) => string
  encode: (key: Key) => string
}

// fetchKeys, when given, answers the probe below with only the key columns: the probe needs
// nothing else, and the full row select can carry embeds that cost a join per row. Without it
// the probe falls back to fetchRows. pageSize is how many rows the first page and each "Show
// more" add; a section that sits above others on its page can ask for fewer.
export async function readOrdered<Row, Key extends { id: string }>(
  page: { top: Key | null; bottom: Key | null },
  order: KeysetOrder<Key>,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Key,
  fetchKeys?: (filter: string, limit: number) => Promise<Key[]>,
  windowCap: number = WINDOW_CAP,
  pageSize: number = PAGE_SIZE,
): Promise<KeysetPage<Row>> {
  const windowed = page.top !== null

  const rows = await fetchRows(order.range(page), page.bottom ? windowCap : pageSize)
  if (rows.length === 0 || (page.bottom === null && rows.length < pageSize)) return { rows, next: null, windowed }

  // "Show more" points at the pageSize-th row past the last one shown, so the read needs those rows'
  // keys. Probing from the last row returned, not from the cursor, means rows that arrived at the
  // top and pushed the range past the cap are picked up here instead of skipped.
  const after = order.after(keyOf(rows[rows.length - 1]))
  const probe = fetchKeys ? await fetchKeys(after, pageSize) : (await fetchRows(after, pageSize)).map(keyOf)
  if (probe.length === 0) return { rows, next: null, windowed }
  const firstId = probe[0].id
  if (rows.length + probe.length > windowCap) {
    return { rows, next: { kind: 'window', cursor: order.encode(probe[0]), firstId }, windowed }
  }
  return { rows, next: { kind: 'extend', cursor: order.encode(probe[probe.length - 1]), firstId }, windowed }
}

export async function readKeyset<Row>(
  rawPage: PageParams,
  cols: KeyColumns,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Cursor,
  fetchKeys?: (filter: string, limit: number) => Promise<Cursor[]>,
  windowCap: number = WINDOW_CAP,
  pageSize: number = PAGE_SIZE,
): Promise<KeysetPage<Row>> {
  const valid = (c: Cursor | null) => (c && (!cols.isId || cols.isId(c.id)) ? c : null)
  const order: KeysetOrder<Cursor> = {
    range: (page) => rangeFilter(cols, page),
    after: (key) => (cols.ascending ? newerThanFilter(cols, key) : olderThanFilter(cols, key)),
    encode: encodeCursor,
  }
  return readOrdered({ top: valid(rawPage.top), bottom: valid(rawPage.bottom) }, order, fetchRows, keyOf, fetchKeys, windowCap, pageSize)
}
