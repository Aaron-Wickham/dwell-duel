export type LegStatus = 'pending' | 'won' | 'lost' | 'voided'

export function legStatus(
  marketStatus: 'open' | 'resolved' | 'voided',
  winningOutcomeId: string | null,
  pickedOutcomeId: string,
): LegStatus {
  if (marketStatus === 'voided') return 'voided'
  if (marketStatus === 'resolved') return winningOutcomeId === pickedOutcomeId ? 'won' : 'lost'
  return 'pending'
}
