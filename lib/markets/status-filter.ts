export const MARKET_FILTERS = ['all', 'open', 'awaiting', 'resolved'] as const
export type MarketFilter = (typeof MARKET_FILTERS)[number]

export const MARKET_FILTER_LABELS: Record<MarketFilter, string> = {
  all: 'All',
  open: 'Open',
  // Short for "Awaiting resolution"; four full-width tabs on a phone have no room for more.
  awaiting: 'Awaiting',
  resolved: 'Resolved',
}

// The tabs were Pending and Closed before #152, and links shared then still carry those values.
const LEGACY_FILTERS: Record<string, MarketFilter> = {
  pending: 'awaiting',
  closed: 'resolved',
}

// An unknown or repeated ?status= falls back to everything, so a stale link still shows a list.
export function readMarketFilter(raw: string | string[] | undefined): MarketFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value !== undefined && Object.hasOwn(LEGACY_FILTERS, value)) return LEGACY_FILTERS[value]
  return MARKET_FILTERS.find((filter) => filter === value) ?? 'all'
}
