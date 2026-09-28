import Link from 'next/link'
import { CircleDot } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import type { MarketBet } from '@/lib/markets/get-market'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'

export function BetList({
  bets,
  outcomes,
  viewerId,
  canBet,
  rowIdPrefix,
}: {
  bets: MarketBet[]
  outcomes: { id: string; label: string }[]
  viewerId: string
  canBet: boolean
  rowIdPrefix?: string
}) {
  if (bets.length === 0) {
    return canBet ? (
      <EmptyState icon={CircleDot} title="No bets yet.">
        Be the first to back an outcome.
      </EmptyState>
    ) : (
      <EmptyState icon={CircleDot} title="No bets yet." />
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {bets.map((b) => (
        <li
          key={b.id}
          {...focusTarget(rowIdPrefix && rowDomId(rowIdPrefix, b.id))}
          className="flex min-h-[52px] items-center gap-3 py-3"
        >
          <Avatar name={b.bettorName} size="sm" />
          <p className="min-w-0">
            <Link href={`/members/${b.profileId}`} transitionTypes={['nav-forward']}>{b.bettorName}</Link> — {b.amount} DC on{' '}
            {outcomes.find((o) => o.id === b.outcomeId)?.label ?? 'unknown outcome'}
            {b.profileId === viewerId && <span className="text-ink2"> (you)</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}
