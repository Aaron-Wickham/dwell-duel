import type { MarketKind } from './kind'

export type Series = 1 | 2 | 3 | 4 | 5 | 6

// The positive side of a two-outcome market: the one its chart draws and its card leads with.
export function isPositiveOutcome(kind: MarketKind, label: string): boolean {
  if (kind === 'binary') return label === 'Yes'
  if (kind === 'over_under') return label.startsWith('Over')
  return false
}

// Multiple choice starts on the green and keeps the ink for its fifth outcome, so a three-way
// market never reads as a yes/no market's No; a sixth outcome is the grey line (--s6 is --line-s).
const MULTIPLE_CHOICE: Series[] = [2, 3, 4, 5, 1]

// A two-outcome market's Yes (or Over) is always the green series and its No (or Under) the ink,
// so the colour never depends on row order.
export function outcomeSeries(kind: MarketKind, label: string, index: number): Series {
  if (kind !== 'multiple_choice') return isPositiveOutcome(kind, label) ? 2 : 1
  return MULTIPLE_CHOICE[index] ?? 6
}

// A two-outcome market's lines mirror each other, so its chart draws only Yes (or Over).
export function plottedOutcomes<T extends { label: string }>(kind: MarketKind, outcomes: T[]): T[] {
  if (kind === 'multiple_choice') return outcomes
  const positive = outcomes.filter((o) => isPositiveOutcome(kind, o.label))
  return positive.length > 0 ? positive : outcomes.slice(0, 1)
}

// The market page's chart card is named for what it draws: "Yes over time" when it draws one line.
export function chartTitle(kind: MarketKind, outcomes: { label: string }[]): string {
  if (kind === 'multiple_choice' || outcomes.length === 0) return 'Chance over time'
  return `${plottedOutcomes(kind, outcomes)[0].label} over time`
}

// Yes before No and Over before Under, whatever order the rows arrive in. Multiple choice keeps
// the order it's read in (insertion time, then label).
export function orderOutcomes<T extends { label: string }>(kind: MarketKind, outcomes: T[]): T[] {
  if (kind === 'multiple_choice') return outcomes
  return [...outcomes].sort((a, b) => Number(isPositiveOutcome(kind, b.label)) - Number(isPositiveOutcome(kind, a.label)))
}
