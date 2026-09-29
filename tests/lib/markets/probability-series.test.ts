import { describe, it, expect } from 'vitest'
import {
  availableRanges,
  buildProbabilitySeries,
  sliceRange,
  withSeededStart,
  type ChartBet,
  type SeriesPoint,
} from '@/lib/markets/probability-series'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-09-25T12:00:00.000Z')

function bet(outcomeId: string, amount: number, createdAt: string): ChartBet {
  return { outcomeId, amount, createdAt }
}

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

describe('buildProbabilitySeries', () => {
  it('has no points before the first bet', () => {
    expect(buildProbabilitySeries(['yes', 'no'], [])).toEqual([])
  })

  it("recomputes every outcome's pool share after each bet, in time order", () => {
    const series = buildProbabilitySeries(
      ['yes', 'no'],
      [
        bet('yes', 10, '2026-09-20T09:00:00.000Z'),
        bet('no', 30, '2026-09-21T09:00:00.000Z'),
        bet('yes', 40, '2026-09-22T09:00:00.000Z'),
      ],
    )
    expect(series).toEqual([
      { t: Date.parse('2026-09-20T09:00:00.000Z'), shares: { yes: 1, no: 0 } },
      { t: Date.parse('2026-09-21T09:00:00.000Z'), shares: { yes: 0.25, no: 0.75 } },
      { t: Date.parse('2026-09-22T09:00:00.000Z'), shares: { yes: 0.625, no: 0.375 } },
    ])
  })

  it('gives every listed outcome a share, including ones nobody has bet on', () => {
    const series = buildProbabilitySeries(
      ['tom', 'sarah', 'mia'],
      [bet('sarah', 20, '2026-09-20T09:00:00.000Z'), bet('tom', 60, '2026-09-20T10:00:00.000Z')],
    )
    expect(series).toEqual([
      { t: Date.parse('2026-09-20T09:00:00.000Z'), shares: { tom: 0, sarah: 1, mia: 0 } },
      { t: Date.parse('2026-09-20T10:00:00.000Z'), shares: { tom: 0.75, sarah: 0.25, mia: 0 } },
    ])
  })

  it('sorts bets that arrive out of time order', () => {
    const series = buildProbabilitySeries(
      ['yes', 'no'],
      [bet('no', 30, '2026-09-21T09:00:00.000Z'), bet('yes', 10, '2026-09-20T09:00:00.000Z')],
    )
    expect(series.map((p) => p.shares)).toEqual([
      { yes: 1, no: 0 },
      { yes: 0.25, no: 0.75 },
    ])
  })

  it('keeps the input order for bets placed at the same instant, one point per bet', () => {
    const at = '2026-09-20T09:00:00.000Z'
    const series = buildProbabilitySeries(['yes', 'no'], [bet('no', 10, at), bet('yes', 30, at)])
    expect(series).toEqual([
      { t: Date.parse(at), shares: { yes: 0, no: 1 } },
      { t: Date.parse(at), shares: { yes: 0.75, no: 0.25 } },
    ])
  })

  it('reads Postgres timestamps with microseconds and an offset', () => {
    const series = buildProbabilitySeries(['yes', 'no'], [bet('yes', 5, '2026-09-20T09:00:00.123456+00:00')])
    expect(series).toEqual([{ t: Date.parse('2026-09-20T09:00:00.123Z'), shares: { yes: 1, no: 0 } }])
  })

  it('ignores a bet on an outcome it was not given', () => {
    const series = buildProbabilitySeries(
      ['yes', 'no'],
      [bet('yes', 10, '2026-09-20T09:00:00.000Z'), bet('other', 90, '2026-09-20T10:00:00.000Z')],
    )
    expect(series).toEqual([{ t: Date.parse('2026-09-20T09:00:00.000Z'), shares: { yes: 1, no: 0 } }])
  })
})

describe('sliceRange', () => {
  const points = [
    point(NOW - 10 * DAY, 1, 0),
    point(NOW - 3 * DAY, 0.5, 0.5),
    point(NOW - 2 * HOUR, 0.25, 0.75),
  ]

  it("returns every point for 'All'", () => {
    expect(sliceRange(points, 'All', NOW)).toBe(points)
  })

  it('carries the last shares before the range in as a point at the range start', () => {
    expect(sliceRange(points, '1D', NOW)).toEqual([point(NOW - DAY, 0.5, 0.5), point(NOW - 2 * HOUR, 0.25, 0.75)])
    expect(sliceRange(points, '1W', NOW)).toEqual([
      point(NOW - 7 * DAY, 1, 0),
      point(NOW - 3 * DAY, 0.5, 0.5),
      point(NOW - 2 * HOUR, 0.25, 0.75),
    ])
  })

  it('adds no carried-in point when nothing came before the range', () => {
    const recent = [point(NOW - 2 * HOUR, 1, 0)]
    expect(sliceRange(recent, '1W', NOW)).toEqual(recent)
  })

  it('holds just the carried-in point when every bet is older than the range', () => {
    expect(sliceRange([point(NOW - 3 * DAY, 1, 0)], '1D', NOW)).toEqual([point(NOW - DAY, 1, 0)])
  })

  it('keeps a point exactly at the range start without carrying another in', () => {
    const edge = [point(NOW - 2 * DAY, 1, 0), point(NOW - DAY, 0.5, 0.5)]
    expect(sliceRange(edge, '1D', NOW)).toEqual([point(NOW - DAY, 0.5, 0.5)])
  })
})

describe('availableRanges', () => {
  it('offers nothing before the first bet', () => {
    expect(availableRanges([], NOW)).toEqual([])
  })

  it("offers only 'All' when every bet is more than a week old", () => {
    expect(availableRanges([point(NOW - 8 * DAY, 1, 0), point(NOW - 9 * DAY, 0.5, 0.5)], NOW)).toEqual(['All'])
  })

  // A young market's every bet is inside the last day, so offering 1D would draw the same
  // line as All -- and reintroduce the crushed-against-the-edge chart (finding C1).
  it("offers only 'All' when every bet is from the last day", () => {
    expect(availableRanges([point(NOW - 3 * HOUR, 1, 0), point(NOW - HOUR, 0.5, 0.5)], NOW)).toEqual(['All'])
  })

  // A point within the day window is also within the week window, so 1D's new gate can never
  // be true without 1W's also being true -- same shape as 1W's own gate, one day narrower.
  it("offers '1D' once a bet is older than a day, alongside one from the last day", () => {
    expect(availableRanges([point(NOW - 2 * DAY, 1, 0), point(NOW - HOUR, 0.5, 0.5)], NOW)).toEqual(['1D', '1W', 'All'])
  })

  it("offers '1W' and 'All' when the latest bet is days old but inside the week", () => {
    expect(availableRanges([point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5)], NOW)).toEqual(['1W', 'All'])
  })

  it('offers all three when bets span the last day, the week and before', () => {
    expect(
      availableRanges([point(NOW - 10 * DAY, 1, 0), point(NOW - 3 * DAY, 0.5, 0.5), point(NOW - HOUR, 0.25, 0.75)], NOW),
    ).toEqual(['1D', '1W', 'All'])
  })
})

describe('buildProbabilitySeries with a seed', () => {
  it('starts at an even split when the market opened, then moves with each bet on seeded pools', () => {
    const series = buildProbabilitySeries(['y', 'n'], [{ outcomeId: 'y', amount: 10, createdAt: '2026-09-02T00:00:00Z' }], {
      seed: 20,
      startAt: '2026-09-01T00:00:00Z',
    })
    expect(series).toEqual([
      { t: Date.parse('2026-09-01T00:00:00Z'), shares: { y: 0.5, n: 0.5 } },
      { t: Date.parse('2026-09-02T00:00:00Z'), shares: { y: 30 / 50, n: 20 / 50 } },
    ])
  })

  it('draws no opening point for an unseeded market', () => {
    expect(buildProbabilitySeries(['y', 'n'], [], { seed: 0, startAt: '2026-09-01T00:00:00Z' })).toEqual([])
  })
})

describe('withSeededStart', () => {
  const market = { seedPerOutcome: 20, createdAt: '2026-09-01T00:00:00Z', outcomeIds: ['y', 'n', 'm'] }
  const later = { t: Date.parse('2026-09-02T00:00:00Z'), shares: { y: 0.5, n: 0.25, m: 0.25 } }

  it('prepends an even split at the opening, whatever the number of outcomes', () => {
    expect(withSeededStart([later], market)).toEqual([
      { t: Date.parse('2026-09-01T00:00:00Z'), shares: { y: 1 / 3, n: 1 / 3, m: 1 / 3 } },
      later,
    ])
  })

  it('gives a seeded market with no bets just the opening point', () => {
    expect(withSeededStart([], market)).toHaveLength(1)
  })

  it('leaves an unseeded market, or one with no outcomes, as it was', () => {
    expect(withSeededStart([later], { ...market, seedPerOutcome: 0 })).toEqual([later])
    expect(withSeededStart([], { ...market, outcomeIds: [] })).toEqual([])
  })

  it('matches the reference series built from the same bets', () => {
    const bets = [{ outcomeId: 'y', amount: 10, createdAt: '2026-09-02T00:00:00Z' }]
    const reference = buildProbabilitySeries(['y', 'n'], bets, { seed: 20, startAt: '2026-09-01T00:00:00Z' })
    const fromBets = reference.slice(1)
    expect(withSeededStart(fromBets, { seedPerOutcome: 20, createdAt: '2026-09-01T00:00:00Z', outcomeIds: ['y', 'n'] })).toEqual(reference)
  })
})
