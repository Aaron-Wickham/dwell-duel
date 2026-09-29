import { xPercent, type ChartWindow } from '@/lib/markets/chart-window'

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// One outcome's chance as a step line in a 100×100 box (x across the plot, y 100% at the top),
// holding each value until the next bet as the full chart's `stepAfter` lines do.
export function sparklinePath(outcomeId: string, plot: ChartWindow): string {
  const steps: { t: number; share: number }[] = []
  for (const point of plot.visible) {
    const step = { t: point.t, share: point.shares[outcomeId] ?? 0 }
    if (steps.at(-1)?.t === point.t) steps[steps.length - 1] = step
    else steps.push(step)
  }
  const last = steps.at(-1)
  if (!last) return ''
  if (last.t < plot.lineEnd) steps.push({ t: plot.lineEnd, share: last.share })

  const y = (share: number) => round(100 - share * 100)
  const [first, ...rest] = steps
  let d = `M${round(xPercent(plot, first.t))} ${y(first.share)}`
  for (const step of rest) d += `H${round(xPercent(plot, step.t))}V${y(step.share)}`
  return d
}
