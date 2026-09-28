import type { ReactNode } from 'react'
import Link from 'next/link'
import { CancelBetButton } from '@/components/markets/cancel-bet-button'
import { LocalTime } from '@/components/ui/local-time'
import { StatusChip } from '@/components/ui/status-chip'
import type { MyBet, MyCancelledBet } from '@/lib/bets/list-my-bets'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'

function ResultChip({ result }: { result: MyBet['result'] }) {
  switch (result.kind) {
    case 'open':
      return <StatusChip tone="open">Open</StatusChip>
    case 'awaiting':
      return <StatusChip tone="wait">Awaiting result</StatusChip>
    case 'won':
      return <StatusChip tone="done">Won {result.payout} DC</StatusChip>
    case 'lost':
      return <StatusChip tone="lost">Lost</StatusChip>
    case 'refunded':
      return <StatusChip tone="void">Voided · refunded</StatusChip>
  }
}

function Row({
  domId,
  marketId,
  marketTitle,
  detail,
  aside,
}: {
  domId: string
  marketId: string
  marketTitle: string
  detail: ReactNode
  aside: ReactNode
}) {
  const titleId = `${domId}-title`
  return (
    <li {...focusTarget(domId, titleId)} className="flex items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          id={titleId}
          href={`/markets/${marketId}`}
          transitionTypes={['nav-forward']}
          className="hit-area font-bold break-words"
        >
          {marketTitle}
        </Link>
        <p className="text-sm text-ink2">{detail}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">{aside}</div>
    </li>
  )
}

export function MyBetRows({ bets, rowIdPrefix }: { bets: MyBet[]; rowIdPrefix: string }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {bets.map((b) => (
        <Row
          key={b.id}
          domId={rowDomId(rowIdPrefix, b.id)}
          marketId={b.marketId}
          marketTitle={b.marketTitle}
          detail={
            <>
              {b.amount} DC on {b.outcomeLabel} · {b.result.kind === 'open' ? 'Closes' : 'Placed'}{' '}
              <LocalTime iso={b.result.kind === 'open' ? b.closeAt : b.placedAt} format="dateTime" />
            </>
          }
          aside={
            <>
              <ResultChip result={b.result} />
              {b.result.kind === 'open' && (
                <CancelBetButton betId={b.id} amount={b.amount} outcomeLabel={b.outcomeLabel} />
              )}
            </>
          }
        />
      ))}
    </ul>
  )
}

export function CancelledBetRows({ bets, rowIdPrefix }: { bets: MyCancelledBet[]; rowIdPrefix: string }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {bets.map((b) => (
        <Row
          key={b.id}
          domId={rowDomId(rowIdPrefix, b.id)}
          marketId={b.marketId}
          marketTitle={b.marketTitle}
          detail={
            <>
              {b.amount} DC on {b.outcomeLabel} · Cancelled <LocalTime iso={b.cancelledAt} format="dateTime" />
            </>
          }
          aside={<StatusChip tone="void">Refunded</StatusChip>}
        />
      ))}
    </ul>
  )
}
