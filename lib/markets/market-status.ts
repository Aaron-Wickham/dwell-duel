export type MarketCardStatus = 'open' | 'awaiting' | 'resolved' | 'voided'

export function marketCardStatus(status: 'open' | 'resolved' | 'voided', closeAt: string, now: Date): MarketCardStatus {
  if (status === 'voided') return 'voided'
  if (status === 'resolved') return 'resolved'
  return new Date(closeAt) > now ? 'open' : 'awaiting'
}

// A market resolved or voided before its close time still shows its shaded zone on the chart
// from the instant it settled (0066's settled_at), instead of looking live until a close time it
// never reached; one settled after closing shades from the close.
export function chartClosedAt(status: MarketCardStatus, closeAt: string, settledAt: string | null): string {
  if ((status !== 'resolved' && status !== 'voided') || !settledAt) return closeAt
  return Date.parse(settledAt) < Date.parse(closeAt) ? settledAt : closeAt
}
