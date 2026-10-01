import type { MarketFilter } from '@/lib/markets/status-filter'

// A title is at most 120 characters (TEXT_LIMITS.marketTitle), so a search past this can't match
// more than a shorter one would; it only makes the query and the URL longer.
export const MARKET_SEARCH_MAX = 80

export const MINE_FILTERS = ['bet', 'made'] as const
export type MineFilter = (typeof MINE_FILTERS)[number]

export const MINE_LABELS: Record<MineFilter | 'all', string> = {
  all: 'Everyone’s',
  bet: 'I bet on',
  made: 'I made',
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

// Control characters and `*` out (see likePattern), runs of whitespace collapsed, capped by code
// points so a surrogate pair is never cut in half.
export function readMarketSearch(raw: string | string[] | undefined): string {
  const text = (first(raw) ?? '').replace(/\p{Cc}/gu, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  return [...text].slice(0, MARKET_SEARCH_MAX).join('').trim()
}

export function readMineFilter(raw: string | string[] | undefined): MineFilter | null {
  const value = first(raw)
  return MINE_FILTERS.find((filter) => filter === value) ?? null
}

// What the member typed is text to find, never pattern syntax: `\`, `%` and `_` would be LIKE
// wildcards, so each is escaped. PostgREST also turns a `*` into `%` before Postgres sees it and
// gives no way to escape one, so a `*` is dropped (readMarketSearch has already done so). The
// pattern goes to the query as a parameter of its own `ilike` filter, never inside an `or(...)`
// string, so it can't add filter syntax.
export function likePattern(query: string): string {
  return `%${query.replace(/\*/g, '').replace(/[\\%_]/g, '\\$&')}%`
}

export type MarketsView = { status?: MarketFilter; q?: string; mine?: MineFilter | null }

// The list's own URL for a view; the cursors never carry over, so a change of view starts at the top.
export function marketsHref({ status = 'all', q = '', mine = null }: MarketsView): string {
  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (status !== 'all') query.set('status', status)
  if (mine) query.set('mine', mine)
  const search = query.toString()
  return search ? `/markets?${search}` : '/markets'
}
