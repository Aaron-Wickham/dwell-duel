export type Series = 1 | 2 | 3 | 4 | 5 | 6

// A yes/no market's Yes is always the green series, so the colour never depends on row order.
export function outcomeSeries(kind: 'binary' | 'multiple_choice', label: string, index: number): Series {
  if (kind === 'binary') return label === 'Yes' ? 2 : 1
  return ((index % 6) + 1) as Series
}
