import { describe, it, expect } from 'vitest'
import { exitStep, raceLayout } from '@/components/leaderboard/race-layout'

const PHONE = { height: 220, pad: 12, gap: 40 }

const shown = (tops: (number | null)[]) => tops.filter((t): t is number => t !== null)
const minGap = (tops: number[]) => {
  const sorted = [...tops].sort((a, b) => a - b)
  return Math.min(...sorted.slice(1).map((t, i) => t - sorted[i]))
}

describe('raceLayout', () => {
  it('keeps zero in range and scales to the highest total when nobody runs away', () => {
    const layout = raceLayout(
      [
        [0, 30, 64],
        [0, 10, 41],
        [0, -3, -3],
      ],
      PHONE,
    )
    expect(layout).toMatchObject({ low: -3, high: 64, clippedTop: null, clippedBottom: null })
    // Best final highest on the page.
    const [a, b, c] = layout.labelTops as number[]
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('clips a runaway leader so second place keeps most of the height', () => {
    const values = [
      [0, 20, 868],
      [0, 40, 40],
      [0, 10, 30],
      [0, -10, -10],
      [0, -5, -20],
    ]
    const layout = raceLayout(values, PHONE)
    expect(layout.clippedTop).toBe(0)
    expect(layout.high).toBeGreaterThan(40)
    expect(layout.high).toBeLessThan(868)
    // Second place's peak sits in the top half of the scale, not squashed at the bottom.
    expect((40 - layout.low) / (layout.high - layout.low)).toBeGreaterThan(0.5)
    // The leader's label goes to the top edge.
    expect(layout.labelTops[0]).toBe(Math.min(...shown(layout.labelTops)))
    expect(exitStep(values[0], layout.high, 'top')).toBe(2)
  })

  it('doesn’t clip when everyone else is flat at zero, since there is nothing to show them by', () => {
    expect(raceLayout([[0, 500], [0, 0], [0, 0]], PHONE).clippedTop).toBeNull()
    expect(raceLayout([[0, 0], [0, 0], [0, -500]], PHONE).clippedBottom).toBeNull()
  })

  it('clips a runaway last place the same way, mirrored', () => {
    const leader = [
      [0, 20, 868],
      [0, 40, 40],
      [0, 10, 30],
      [0, -10, -10],
      [0, -5, -20],
    ]
    const values = leader.map((v) => v.map((x) => -x))
    const layout = raceLayout(values, PHONE)
    expect(layout.clippedTop).toBeNull()
    expect(layout.clippedBottom).toBe(0)
    const mirrored = raceLayout(leader, PHONE)
    expect(mirrored.clippedBottom).toBeNull()
    expect(layout.low).toBeCloseTo(-mirrored.high)
    expect(layout.high).toBeCloseTo(-mirrored.low)
    // Second-last's trough sits in the bottom half of the scale, not squashed at the top.
    expect((layout.high - -40) / (layout.high - layout.low)).toBeGreaterThan(0.5)
    // The last place's label goes to the bottom edge, still under everyone else's.
    expect(layout.labelTops[0]).toBe(Math.max(...shown(layout.labelTops)))
    expect(exitStep(values[0], layout.low, 'bottom')).toBe(2)
  })

  it('labels a member whose low ran off the bottom but who recovered at their true place', () => {
    const values = [
      [0, 40, 40],
      [0, -800, 20],
      [0, 10, 10],
    ]
    const layout = raceLayout(values, PHONE)
    expect(layout).toMatchObject({ clippedTop: null, clippedBottom: 1 })
    const [first, second, third] = layout.labelTops as number[]
    expect(second).toBeGreaterThan(first)
    expect(second).toBeLessThan(third)
  })

  it('clips both ends when a runaway at each end would hide the other', () => {
    const values = [
      [0, 900],
      [0, 10],
      [0, 5],
      [0, -800],
    ]
    const layout = raceLayout(values, PHONE)
    expect(layout).toMatchObject({ clippedTop: 0, clippedBottom: 3 })
    expect(layout.high).toBeLessThan(900)
    expect(layout.low).toBeGreaterThan(-800)
    expect(layout.low).toBeLessThan(0)
    expect(exitStep(values[0], layout.high, 'top')).toBe(1)
    expect(exitStep(values[3], layout.low, 'bottom')).toBe(1)
    const tops = layout.labelTops as number[]
    expect(tops[0]).toBe(Math.min(...tops))
    expect(tops[3]).toBe(Math.max(...tops))
  })

  it('judges each end with the other end’s lines still on the scale', () => {
    // Against the middle alone the leader looks like a runaway, but the last place stays on the
    // scale, so the leader is within reach of everyone and nothing is clipped.
    expect(raceLayout([[0, 100], [0, 30], [0, -20]], PHONE)).toMatchObject({ clippedTop: null, clippedBottom: null })
  })

  it('doesn’t blow a tight pack up into a fake spread beside a runaway', () => {
    const layout = raceLayout([[0, 900], [0, 5], [0, 4], [0, 3]], PHONE)
    expect(layout.clippedTop).toBe(0)
    // At least 8% of the leader's range, so the pack's 5 DC spread stays small.
    expect(layout.high).toBeGreaterThanOrEqual(72)
  })

  it('labels a member whose peak ran off the top but who fell back at their true place', () => {
    const values = [
      [0, 50, 50],
      [0, 800, 20],
      [0, 10, 10],
    ]
    const layout = raceLayout(values, PHONE)
    expect(layout.clippedTop).toBe(1)
    const [first, second] = layout.labelTops as number[]
    expect(second).toBeGreaterThan(first)
  })

  it('pushes five near-equal labels apart so none overlap', () => {
    const layout = raceLayout([[0, 100], [0, 99], [0, 98], [0, 97], [0, 96]], PHONE)
    const tops = shown(layout.labelTops)
    expect(tops).toHaveLength(5)
    expect(minGap(tops)).toBeGreaterThanOrEqual(PHONE.gap - 0.001)
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...tops)).toBeLessThanOrEqual(PHONE.height - 20)
  })

  it('labels only as many as fit, best first, leaving the rest to the readout', () => {
    const values = Array.from({ length: 8 }, (_, i) => [0, 80 - i])
    const layout = raceLayout(values, PHONE)
    expect(layout.labelTops.map((t) => t !== null)).toEqual([true, true, true, true, true, false, false, false])
    expect(minGap(shown(layout.labelTops))).toBeGreaterThanOrEqual(PHONE.gap - 0.001)
  })

  it('gives an all-zero month a scale instead of dividing by zero', () => {
    const layout = raceLayout([[0, 0], [0, 0]], PHONE)
    expect(layout.high).toBeGreaterThan(layout.low)
    expect(shown(layout.labelTops).every(Number.isFinite)).toBe(true)
  })
})
