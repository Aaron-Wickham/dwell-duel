export const MARKET_FILTERS = ['open', 'awaiting', 'resolved'] as const
export type MarketFilter = (typeof MARKET_FILTERS)[number]

export const MARKET_FILTER_LABELS: Record<MarketFilter, string> = {
  open: 'Open',
  awaiting: 'Waiting',
  resolved: 'Resolved',
}

// The tabs were Pending and Closed before #152, and there was an All tab before #389; links
// shared then still carry those values.
const LEGACY_FILTERS: Record<string, MarketFilter> = {
  pending: 'awaiting',
  closed: 'resolved',
  all: 'open',
}

// An unknown or repeated ?status= falls back to Open, so a stale link still shows a list.
export function readMarketFilter(raw: string | string[] | undefined): MarketFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value !== undefined && Object.hasOwn(LEGACY_FILTERS, value)) return LEGACY_FILTERS[value]
  return MARKET_FILTERS.find((filter) => filter === value) ?? 'open'
}
