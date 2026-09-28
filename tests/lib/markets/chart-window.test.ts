import { describe, it, expect } from 'vitest'
import { chartWindow, initialRange, xPercent } from '@/lib/markets/chart-window'
import { sparklinePath } from '@/lib/markets/sparkline'
import type { SeriesPoint } from '@/lib/markets/probability-series'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-09-25T12:00:00.000Z')

function point(t: number, yes: number, no: number): SeriesPoint {
  return { t, shares: { yes, no } }
}

describe('initialRange', () => {
  it('opens an open market on the last week when it has one, and a closed one on its whole history', () => {
    expect(initialRange(['1D', '1W', 'All'], false)).toBe('1W')
    expect(initialRange(['All'], false)).toBe('All')
    expect(initialRange(['1D', '1W', 'All'], true)).toBe('All')
  })
})

describe('chartWindow', () => {
  it('has nothing to plot without points', () => {
    expect(chartWindow([], 'All', NOW, null)).toBeNull()
  })

  it('runs an open market from its first point to now', () => {
    const plot = chartWindow([point(NOW - 4 * HOUR, 0.5, 0.5), point(NOW - HOUR, 0.8, 0.2)], 'All', NOW, null)!
    expect(plot.start).toBe(NOW - 4 * HOUR)
    expect(plot.end).toBe(NOW)
    expect(plot.lineEnd).toBe(NOW)
  })

  it('stops a closed market\'s lines at the close and gives the shaded zone 14% of the plot', () => {
    const closedMs = NOW - 10 * DAY
    const plot = chartWindow([point(NOW - 20 * DAY, 0.5, 0.5)], 'All', NOW, closedMs)!
    expect(plot.lineEnd).toBe(closedMs)
    expect(xPercent(plot, closedMs)).toBeCloseTo(86)
  })

  it('starts a week range a week ago, carrying in the value from before it', () => {
    const plot = chartWindow([point(NOW - 10 * DAY, 1, 0), point(NOW - 2 * HOUR, 0.75, 0.25)], '1W', NOW, null)!
    expect(plot.start).toBe(NOW - 7 * DAY)
    expect(plot.visible[0]).toEqual(point(NOW - 7 * DAY, 1, 0))
  })

  it('never has a zero-length span', () => {
    const plot = chartWindow([point(NOW, 0.5, 0.5)], 'All', NOW, null)!
    expect(plot.end - plot.start).toBe(1000)
  })
})

describe('sparklinePath', () => {
  it('holds each chance until the next bet, then steps, running on to the line end', () => {
    const points = [point(NOW - 4 * HOUR, 0.5, 0.5), point(NOW - 2 * HOUR, 0.75, 0.25)]
    const plot = chartWindow(points, 'All', NOW, null)!
    expect(sparklinePath('yes', plot)).toBe('M0 50H50V25H100V25')
    expect(sparklinePath('no', plot)).toBe('M0 50H50V75H100V75')
  })

  it('keeps only the last of several points at the same instant', () => {
    const points = [point(NOW - 4 * HOUR, 0.5, 0.5), point(NOW - 4 * HOUR, 0.9, 0.1)]
    const plot = chartWindow(points, 'All', NOW, null)!
    expect(sparklinePath('yes', plot)).toBe('M0 10H100V10')
  })

  it('stops at the close, leaving the shaded zone empty', () => {
    const closedMs = NOW - 10 * DAY
    const plot = chartWindow([point(NOW - 20 * DAY, 0.5, 0.5), point(NOW - 15 * DAY, 1, 0)], 'All', NOW, closedMs)!
    expect(sparklinePath('yes', plot)).toBe('M0 50H43V0H86V0')
  })

  it('draws a missing outcome share as zero', () => {
    const plot = chartWindow([{ t: NOW - HOUR, shares: { yes: 1 } }], 'All', NOW, null)!
    expect(sparklinePath('no', plot)).toBe('M0 100H100V100')
  })
})
