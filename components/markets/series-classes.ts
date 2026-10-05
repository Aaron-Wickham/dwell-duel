import type { Series } from '@/lib/markets/outcome-series'

// Its own module so the client-only probability chart doesn't have to import the
// server-rendered OutcomeRow just to reuse this map.
export const SERIES_BG: Record<Series, string> = {
  1: 'bg-s1',
  2: 'bg-s2',
  3: 'bg-s3',
  4: 'bg-s4',
  5: 'bg-s5',
  6: 'bg-s6',
}

export const SERIES_STROKE: Record<Series, string> = {
  1: 'stroke-s1',
  2: 'stroke-s2',
  3: 'stroke-s3',
  4: 'stroke-s4',
  5: 'stroke-s5',
  6: 'stroke-s6',
}
