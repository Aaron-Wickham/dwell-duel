import { describe, it, expect } from 'vitest'
import { describeMovement, weeklyChange } from '@/lib/markets/chart-summary'
import { bucketByTime, chartWindow } from '@/lib/markets/chart-window'
import type { SeriesPoint } from '@/lib/markets/probability-series'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-25T12:00:00.000Z')
const point = (t: number, yes: number): SeriesPoint => ({ t, shares: { yes, no: 1 - yes } })
const yes = [{ id: 'yes', label: 'Yes' }]

describe('describeMovement', () => {
  it('says how the line moved across the range', () => {
    const plot = chartWindow([point(NOW - 10 * DAY, 0.3), point(NOW - 3 * DAY, 0.46), point(NOW - DAY, 0.61)], '1W', NOW, null)!
    expect(describeMovement(yes, plot, '1W')).toBe('Yes rose from 30% to 61% this week.')
  })

  it('says a line fell, or held, and joins several', () => {
    const plot = chartWindow([point(NOW - 2 * DAY, 0.6), point(NOW - DAY, 0.4)], 'All', NOW, null)!
    expect(describeMovement([...yes, { id: 'no', label: 'No' }], plot, 'All')).toBe(
      'Yes fell from 60% to 40% since it opened; No rose from 40% to 60% since it opened.',
    )
    const flat = chartWindow([point(NOW - 2 * DAY, 0.5), point(NOW - DAY, 0.5)], 'All', NOW, null)!
    expect(describeMovement(yes, flat, 'All')).toBe('Yes held at 50% since it opened.')
  })
})

describe('weeklyChange', () => {
  it('is the points moved since the chance a week ago', () => {
    expect(weeklyChange([point(NOW - 9 * DAY, 0.53), point(NOW - 2 * DAY, 0.7)], 'yes', 61, NOW)).toBe(8)
    expect(weeklyChange([point(NOW - 9 * DAY, 0.39), point(NOW - 2 * DAY, 0.2)], 'yes', 34, NOW)).toBe(-5)
  })

  it('is null without a week of history', () => {
    expect(weeklyChange([point(NOW - 2 * DAY, 0.5)], 'yes', 60, NOW)).toBeNull()
    expect(weeklyChange([], 'yes', 60, NOW)).toBeNull()
  })
})

describe('bucketByTime (#391)', () => {
  const at = (minutes: number, share: number) => point(NOW - DAY + minutes * 60_000, share)

  it('keeps each bucket’s last point, by time rather than by count', () => {
    // A burst of bets in the first hour, then one late in the day.
    const points = [at(0, 0.5), at(10, 0.6), at(20, 0.7), at(30, 0.65), at(40, 0.8), at(20 * 60, 0.4)]
    expect(bucketByTime(points, NOW - DAY, NOW, 24).map((p) => p.shares.yes)).toEqual([0.5, 0.8, 0.4])
  })

  it('always keeps the first point, so the line starts at the left edge', () => {
    const thinned = bucketByTime([at(0, 0.5), at(5, 0.9), at(6, 0.1)], NOW - DAY, NOW, 4)
    expect(thinned.map((p) => p.shares.yes)).toEqual([0.5, 0.1])
  })

  it('leaves a sparse series alone', () => {
    const points = [at(0, 0.5), at(120, 0.6), at(240, 0.7)]
    expect(bucketByTime(points, NOW - DAY, NOW, 24)).toEqual(points)
  })

  it('draws no more than one point a bucket, plus the first, however many bets there are', () => {
    const points = Array.from({ length: 1000 }, (_, i) => point(NOW - DAY + i * 60_000, (i % 10) / 10))
    expect(chartWindow(points, 'All', NOW, null, 50)!.visible.length).toBeLessThanOrEqual(51)
  })
})
