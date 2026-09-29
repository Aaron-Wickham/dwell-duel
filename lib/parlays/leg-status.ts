export type LegStatus = 'open' | 'awaiting' | 'won' | 'lost' | 'voided'

export function legStatus(
  marketStatus: 'open' | 'resolved' | 'voided',
  winningOutcomeId: string | null,
  pickedOutcomeId: string,
  closeAt: string,
  now: number,
): LegStatus {
  if (marketStatus === 'voided') return 'voided'
  if (marketStatus === 'resolved') return winningOutcomeId === pickedOutcomeId ? 'won' : 'lost'
  return Date.parse(closeAt) > now ? 'open' : 'awaiting'
}
