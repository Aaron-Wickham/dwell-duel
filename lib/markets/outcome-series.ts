import type { MarketKind } from './kind'

export type Series = 1 | 2 | 3 | 4 | 5 | 6

// A yes/no market's Yes is always the green series, so the colour never depends on row order. An
// over/under's Over is blue and Under gold: a blue/orange pair, told apart by lightness as well.
export function outcomeSeries(kind: MarketKind, label: string, index: number): Series {
  if (kind === 'binary') return label === 'Yes' ? 2 : 1
  if (kind === 'over_under') return label.startsWith('Over') ? 4 : 3
  return ((index % 6) + 1) as Series
}
