import { describe, it, expect } from 'vitest'
import { decodeCursor, encodeCursor, readPageParams, type Cursor, type PageParams } from '@/lib/pagination/cursor'
import {
  isBigintId,
  newerThanFilter,
  olderThanFilter,
  rangeFilter,
  readKeyset,
  type KeyColumns,
  type KeysetPage,
} from '@/lib/pagination/keyset'

const COLS: KeyColumns = { ts: 'created_at', id: 'id' }

type Row = { created_at: string; id: string }

// Evaluates the filter strings the way PostgREST's `or=(…)` does, for the three shapes keyset.ts
// builds: `col.op."value"` terms, nested and(…) / or(…), and a top-level list that is an OR. Every
// timestamp and id in these fixtures is fixed-width, so plain string comparison orders them.
function splitTerms(list: string): string[] {
  const terms: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '"') quoted = !quoted
    else if (!quoted && c === '(') depth++
    else if (!quoted && c === ')') depth--
    else if (!quoted && depth === 0 && c === ',') {
      terms.push(list.slice(start, i))
      start = i + 1
    }
  }
  terms.push(list.slice(start))
  return terms
}

function matches(term: string, row: Row): boolean {
  const group = /^(and|or)\((.*)\)$/.exec(term)
  if (group) {
    const parts = splitTerms(group[2]).map((t) => matches(t, row))
    return group[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean)
  }
  const leaf = /^(\w+)\.(lt|lte|gt|gte|eq)\."([^"]*)"$/.exec(term)
  if (!leaf) throw new Error(`unparsed filter term: ${term}`)
  const value = row[leaf[1] as keyof Row]
  const other = leaf[3]
  switch (leaf[2]) {
    case 'lt':
      return value < other
    case 'lte':
      return value <= other
    case 'gt':
      return value > other
    case 'gte':
      return value >= other
    default:
      return value === other
  }
}

function fakeTable(rows: Row[]) {
  const sorted = [...rows].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1,
  )
  const calls: { filter: string | null; limit: number }[] = []
  async function fetchRows(filter: string | null, limit: number): Promise<Row[]> {
    calls.push({ filter, limit })
    return sorted.filter((row) => filter === null || splitTerms(filter).some((t) => matches(t, row))).slice(0, limit)
  }
  return { sorted, calls, fetchRows }
}

const keyOf = (row: Row): Cursor => ({ ts: row.created_at, id: row.id })

// n rows, newest first by position: row 0 is the newest. Rows share timestamps in pairs, so page
// boundaries fall inside a tie (rows 49 and 50 of 120 do), and every timestamp carries microseconds.
function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const second = Math.floor((n - i) / 2)
    const ts = `2026-09-26T${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor(second / 60) % 60).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}.123456+00:00`
    return { created_at: ts, id: String(n - i).padStart(6, '0') }
  })
}

function pageFrom(page: KeysetPage<Row>, current: PageParams, param = 'before'): PageParams {
  if (!page.next) throw new Error('no next page')
  const params =
    page.next.kind === 'extend'
      ? { [param]: page.next.cursor, [`${param}_from`]: current.top ? encodeCursor(current.top) : undefined }
      : { [`${param}_from`]: page.next.cursor }
  return readPageParams(params, param)
}

describe('filter strings', () => {
  const c: Cursor = { ts: '2026-09-26T10:15:30.123456+00:00', id: '99' }
  const t: Cursor = { ts: '2026-09-26T12:00:00+00:00', id: 'bet:7' }

  // Every filter also carries a plain bound on the timestamp column, alongside the (ts, id)
  // tiebreak OR: a pure-OR filter gives Postgres nothing to seek by on the (ts desc, id desc)
  // index, so the plan comes back as an Index Scan with only a Filter, walking the whole table
  // (proven by EXPLAIN in tests/db/data-layer-indexes.test.ts). The bound is redundant with the
  // OR — `lt`/`eq` both imply `lte`, `gt`/`eq` both imply `gte` — but gives the planner an Index
  // Cond it can seek by.
  it('builds the strictly older and strictly newer filters', () => {
    expect(olderThanFilter(COLS, c)).toBe(
      'and(created_at.lte."2026-09-26T10:15:30.123456+00:00",or(created_at.lt."2026-09-26T10:15:30.123456+00:00",and(created_at.eq."2026-09-26T10:15:30.123456+00:00",id.lt."99")))',
    )
    expect(newerThanFilter({ ts: 'occurred_at', id: 'id' }, c)).toBe(
      'and(occurred_at.gte."2026-09-26T10:15:30.123456+00:00",or(occurred_at.gt."2026-09-26T10:15:30.123456+00:00",and(occurred_at.eq."2026-09-26T10:15:30.123456+00:00",id.gt."99")))',
    )
  })

  it('builds the range filter for each combination of bounds', () => {
    expect(rangeFilter(COLS, { top: null, bottom: null })).toBeNull()
    expect(rangeFilter(COLS, { top: null, bottom: c })).toBe(
      'and(created_at.gte."2026-09-26T10:15:30.123456+00:00",or(created_at.gt."2026-09-26T10:15:30.123456+00:00",and(created_at.eq."2026-09-26T10:15:30.123456+00:00",id.gte."99")))',
    )
    expect(rangeFilter(COLS, { top: t, bottom: null })).toBe(
      'and(created_at.lte."2026-09-26T12:00:00+00:00",or(created_at.lt."2026-09-26T12:00:00+00:00",and(created_at.eq."2026-09-26T12:00:00+00:00",id.lte."bet:7")))',
    )
    expect(rangeFilter(COLS, { top: t, bottom: c })).toBe(
      'and(created_at.gte."2026-09-26T10:15:30.123456+00:00",or(created_at.gt."2026-09-26T10:15:30.123456+00:00",and(created_at.eq."2026-09-26T10:15:30.123456+00:00",id.gte."99")),' +
        'created_at.lte."2026-09-26T12:00:00+00:00",or(created_at.lt."2026-09-26T12:00:00+00:00",and(created_at.eq."2026-09-26T12:00:00+00:00",id.lte."bet:7")))',
    )
  })
})

describe('readKeyset', () => {
  const FIRST: PageParams = { top: null, bottom: null }

  it('reads the newest 50, and points Show more at the 50th row past them', async () => {
    const table = fakeTable(makeRows(120))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)

    expect(page.rows).toEqual(table.sorted.slice(0, 50))
    expect(page.windowed).toBe(false)
    expect(page.next?.kind).toBe('extend')
    expect(decodeCursor(page.next?.cursor)).toEqual(keyOf(table.sorted[99]))
    expect(table.calls).toEqual([
      { filter: null, limit: 50 },
      { filter: olderThanFilter(COLS, keyOf(table.sorted[49])), limit: 50 },
    ])
  })

  it('extends the range down to and including the cursor, then to the end, with nothing skipped or repeated', async () => {
    const table = fakeTable(makeRows(120))
    const first = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)
    const secondParams = pageFrom(first, FIRST)
    const second = await readKeyset(secondParams, COLS, table.fetchRows, keyOf)

    expect(second.rows).toEqual(table.sorted.slice(0, 100))
    expect(decodeCursor(second.next?.cursor)).toEqual(keyOf(table.sorted[119]))
    expect(table.calls[2].limit).toBe(500)

    const third = await readKeyset(pageFrom(second, secondParams), COLS, table.fetchRows, keyOf)
    expect(third.rows).toEqual(table.sorted)
    expect(third.next).toBeNull()
  })

  it('shows a short first page with no Show more, in one request', async () => {
    const table = fakeTable(makeRows(30))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)
    expect(page).toEqual({ rows: table.sorted, next: null, windowed: false })
    expect(table.calls).toHaveLength(1)
  })

  it('shows no Show more when exactly 50 rows exist', async () => {
    const table = fakeTable(makeRows(50))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)
    expect(page.rows).toHaveLength(50)
    expect(page.next).toBeNull()
    expect(table.calls).toHaveLength(2)
  })

  it('reads an empty list as empty, with no probe', async () => {
    const table = fakeTable([])
    expect(await readKeyset(FIRST, COLS, table.fetchRows, keyOf)).toEqual({ rows: [], next: null, windowed: false })
    expect(table.calls).toHaveLength(1)
  })

  it('starts a fresh window at the row after the cap, then extends within it', async () => {
    const table = fakeTable(makeRows(600))
    let params = FIRST
    let page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    while (page.next?.kind === 'extend') {
      params = pageFrom(page, params)
      page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    }
    expect(page.rows).toEqual(table.sorted.slice(0, 500))
    expect(page.next?.kind).toBe('window')
    expect(decodeCursor(page.next?.cursor)).toEqual(keyOf(table.sorted[500]))
    expect(Math.max(...table.calls.map((c) => c.limit))).toBe(500)

    params = pageFrom(page, params)
    page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    expect(page.windowed).toBe(true)
    expect(page.rows).toEqual(table.sorted.slice(500, 550))
    expect(page.next?.kind).toBe('extend')

    params = pageFrom(page, params)
    page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    expect(page.windowed).toBe(true)
    expect(page.rows).toEqual(table.sorted.slice(500))
    expect(page.next).toBeNull()
  })

  it('never skips rows when new ones arrive at the top and push the range past the cap', async () => {
    const rows = makeRows(600)
    const table = fakeTable(rows)
    // A link made when its range held 480 rows, read after 40 more arrived at the top: 520 now.
    const page = await readKeyset({ top: null, bottom: keyOf(table.sorted[519]) }, COLS, table.fetchRows, keyOf)

    expect(page.rows).toEqual(table.sorted.slice(0, 500))
    expect(page.next).toEqual({ kind: 'window', cursor: encodeCursor(keyOf(table.sorted[500])) })
  })

  it('treats a cursor whose id the column cannot hold as absent', async () => {
    const table = fakeTable(makeRows(120))
    const cols: KeyColumns = { ...COLS, isId: isBigintId }
    const bad: Cursor = { ts: '2026-09-26T00:00:30.123456+00:00', id: 'bet:1' }
    const page = await readKeyset({ top: bad, bottom: bad }, cols, table.fetchRows, keyOf)
    expect(page.windowed).toBe(false)
    expect(page.rows).toEqual(table.sorted.slice(0, 50))
    expect(table.calls[0]).toEqual({ filter: null, limit: 50 })
  })
})

describe('isBigintId', () => {
  it('accepts up to 18 digits only', () => {
    expect(isBigintId('1')).toBe(true)
    expect(isBigintId('123456789012345678')).toBe(true)
    expect(isBigintId('1234567890123456789')).toBe(false)
    expect(isBigintId('bet:1')).toBe(false)
    expect(isBigintId('-1')).toBe(false)
  })
})
