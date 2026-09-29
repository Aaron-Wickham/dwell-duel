export const MARKET_FILTERS = ['all', 'open', 'pending', 'closed'] as const
export type MarketFilter = (typeof MARKET_FILTERS)[number]

export const MARKET_FILTER_LABELS: Record<MarketFilter, string> = {
  all: 'All',
  open: 'Open',
  // "Pending" stands for pending resolution; four full-width tabs on a phone have no room for more.
  pending: 'Pending',
  closed: 'Closed',
}

// An unknown or repeated ?status= falls back to everything, so a stale link still shows a list.
export function readMarketFilter(raw: string | string[] | undefined): MarketFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  return MARKET_FILTERS.find((filter) => filter === value) ?? 'all'
}
