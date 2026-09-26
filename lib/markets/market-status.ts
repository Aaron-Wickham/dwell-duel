export type MarketCardStatus = 'open' | 'awaiting' | 'resolved' | 'voided'

export function marketCardStatus(status: 'open' | 'resolved' | 'voided', closeAt: string, now: Date): MarketCardStatus {
  if (status === 'voided') return 'voided'
  if (status === 'resolved') return 'resolved'
  return new Date(closeAt) > now ? 'open' : 'awaiting'
}

// A market resolved before its close time still shows its "Resolved" shaded zone on the
// chart, using whichever of the two instants came first, instead of looking live until a
// close time it never reached.
export function chartClosedAt(status: MarketCardStatus, closeAt: string, resolvedAt: string | null): string {
  if (status !== 'resolved' || !resolvedAt) return closeAt
  return Date.parse(resolvedAt) < Date.parse(closeAt) ? resolvedAt : closeAt
}
