import Link from 'next/link'
import { CircleDot } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { CancelBetButton } from '@/components/markets/cancel-bet-button'
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
      {bets.map((b) => {
        const outcomeLabel = outcomes.find((o) => o.id === b.outcomeId)?.label ?? 'unknown outcome'
        const mine = b.profileId === viewerId
        const domId = rowIdPrefix && rowDomId(rowIdPrefix, b.id)
        // Named from the sentence alone, so the Cancel button's label stays out of the row's name.
        const sentenceId = domId ? `${domId}-sentence` : undefined
        return (
          <li key={b.id} {...focusTarget(domId, sentenceId)} className="flex min-h-[52px] items-center gap-3 py-3">
            <Avatar name={b.bettorName} src={b.bettorAvatarSrc} size="sm" />
            <p id={sentenceId} className="min-w-0 flex-1">
              <Link href={`/members/${b.profileId}`} transitionTypes={['nav-forward']}>{b.bettorName}</Link> — {b.amount} DC on{' '}
              {outcomeLabel}
              {mine && <span className="text-ink2"> (you)</span>}
            </p>
            {mine && canBet && <CancelBetButton betId={b.id} amount={b.amount} outcomeLabel={outcomeLabel} />}
          </li>
        )
      })}
    </ul>
  )
}
