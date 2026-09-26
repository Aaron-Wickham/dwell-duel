export type MarketCardStatus = 'open' | 'awaiting' | 'resolved' | 'voided'

export function marketCardStatus(status: 'open' | 'resolved' | 'voided', closeAt: string, now: Date): MarketCardStatus {
  if (status === 'voided') return 'voided'
  if (status === 'resolved') return 'resolved'
  return new Date(closeAt) > now ? 'open' : 'awaiting'
}
