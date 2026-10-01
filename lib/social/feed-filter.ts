import type { SearchParams } from '@/lib/pagination/cursor'

export const FEED_SHOWS = ['all', 'results', 'mine'] as const
export type FeedShow = (typeof FEED_SHOWS)[number]

export const FEED_SHOW_LABELS: Record<FeedShow, string> = {
  all: 'All',
  results: 'Results',
  mine: 'Mine',
}

// What "Results" means: a market settling, a winning bet or parlay, a season ending.
export const RESULT_KINDS = ['market_resolved', 'bet_won', 'parlay_won', 'season_champion'] as const

const FEED_PATH = '/feed'

// An unknown or repeated ?show= falls back to everything, so a stale link still shows a feed.
export function readFeedShow(raw: SearchParams[string]): FeedShow {
  const value = Array.isArray(raw) ? raw[0] : raw
  return FEED_SHOWS.find((show) => show === value) ?? 'all'
}

// A tab link carries no cursor, so switching tabs always starts at the newest.
export function feedShowHref(show: FeedShow): string {
  return show === 'all' ? FEED_PATH : `${FEED_PATH}?show=${show}`
}
