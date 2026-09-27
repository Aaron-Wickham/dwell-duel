export const PAGE_SIZE = 50
export const WINDOW_CAP = 500

export type Cursor = { ts: string; id: string }
export type PageParams = { top: Cursor | null; bottom: Cursor | null }
export type NextPage = { kind: 'extend' | 'window'; cursor: string }
export type SearchParams = Record<string, string | string[] | undefined>

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/
const ID = /^[A-Za-z0-9:_-]{1,100}$/
const BASE64URL = /^[A-Za-z0-9_-]{1,400}$/
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Date.parse accepts 30 February, year 0000 and a +23:00 offset, all of which Postgres rejects with
// an error. A cursor that reaches the query must be one Postgres can read, or a tampered link
// would show the error page instead of the first page.
function isPostgresTimestamp(ts: string): boolean {
  if (!TS.test(ts) || Number.isNaN(Date.parse(ts))) return false
  const year = Number(ts.slice(0, 4))
  const month = Number(ts.slice(5, 7))
  const day = Number(ts.slice(8, 10))
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const days = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1]
  if (year < 1 || days === undefined || day < 1 || day > days) return false
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(ts)
  return !offset || Number(offset[2]) <= 15
}

// btoa/atob rather than Buffer, so the module is the same on the Node and Edge runtimes. Every
// valid cursor is ASCII, so the binary string btoa needs is the text itself.
export function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify([cursor.ts, cursor.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCursor(raw: string | string[] | undefined | null): Cursor | null {
  if (typeof raw !== 'string' || !BASE64URL.test(raw)) return null
  let parsed: unknown
  try {
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    parsed = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null
  const [ts, id] = parsed
  if (typeof ts !== 'string' || typeof id !== 'string') return null
  if (!isPostgresTimestamp(ts) || !ID.test(id)) return null
  return { ts, id }
}

export function readPageParams(searchParams: SearchParams, param: string): PageParams {
  return { top: decodeCursor(searchParams[`${param}_from`]), bottom: decodeCursor(searchParams[param]) }
}

function toQuery(searchParams: SearchParams): URLSearchParams {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v)
  }
  return query
}

function withQuery(pathname: string, query: URLSearchParams): string {
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function showMoreHref(pathname: string, searchParams: SearchParams, param: string, next: NextPage): string {
  const query = toQuery(searchParams)
  if (next.kind === 'extend') {
    query.set(param, next.cursor)
  } else {
    query.set(`${param}_from`, next.cursor)
    query.delete(param)
  }
  return withQuery(pathname, query)
}

export function newestHref(pathname: string, searchParams: SearchParams, param: string): string {
  const query = toQuery(searchParams)
  query.delete(param)
  query.delete(`${param}_from`)
  return withQuery(pathname, query)
}
