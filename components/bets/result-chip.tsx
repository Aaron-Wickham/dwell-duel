import { StatusChip } from '@/components/ui/status-chip'
import type { MyBetResult } from '@/lib/bets/list-my-bets'
import { formatDcAmount } from '@/lib/format/dc'

// A solo bet's state, the same on My bets and the market page's Your position card.
export function ResultChip({ result }: { result: MyBetResult }) {
  switch (result.kind) {
    case 'open':
      return <StatusChip tone="open">Open</StatusChip>
    case 'awaiting':
      return <StatusChip tone="wait">Waiting for a result</StatusChip>
    case 'won':
      return <StatusChip tone="won">Won {formatDcAmount(result.payout)}</StatusChip>
    case 'lost':
      return <StatusChip tone="lost">Lost</StatusChip>
    case 'refunded':
      return <StatusChip tone="void">{result.reason === 'no_winners' ? 'Refunded · no winners' : 'Refunded'}</StatusChip>
  }
}
