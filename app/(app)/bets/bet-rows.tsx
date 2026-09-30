import type { ReactNode } from 'react'
import Link from 'next/link'
import { CancelBetButton } from '@/components/markets/cancel-bet-button'
import { LocalTime } from '@/components/ui/local-time'
import { StatusChip } from '@/components/ui/status-chip'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import type { MyBet, MyCancelledBet } from '@/lib/bets/list-my-bets'
import type { Wager } from '@/lib/bets/list-my-wagers'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'

function ResultChip({ result }: { result: MyBet['result'] }) {
  switch (result.kind) {
    case 'open':
      return <StatusChip tone="open">Open</StatusChip>
    case 'awaiting':
      return <StatusChip tone="wait">Awaiting resolution</StatusChip>
    case 'won':
      return <StatusChip tone="done">Won {result.payout} DC</StatusChip>
    case 'lost':
      return <StatusChip tone="lost">Lost</StatusChip>
    case 'refunded':
      return <StatusChip tone="void">{result.reason === 'no_winners' ? 'Refunded · no winners' : 'Refunded'}</StatusChip>
  }
}

// A list with dividers on a phone; at lg, a grid of cards like the markets page. Each card
// stretches to its row's height, so its status sits at the same place across a row.
const betListClass = 'flex flex-col divide-y divide-line lg:grid lg:grid-cols-3 lg:gap-4 lg:divide-y-0 lg:py-3'

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
    <li
      {...focusTarget(domId, titleId)}
      className="pressable hover-lift-row relative flex items-start justify-between gap-3 py-3 lg:hover-lift lg:before:hidden lg:flex-col lg:justify-start lg:rounded-[14px] lg:border lg:border-line lg:p-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          id={titleId}
          href={`/markets/${marketId}`}
          transitionTypes={['nav-forward']}
          className="stretched-link font-bold break-words"
        >
          {marketTitle}
        </Link>
        <p className="text-sm text-ink2">{detail}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 lg:mt-auto lg:w-full lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        {aside}
      </div>
    </li>
  )
}

export function WagerRows({ wagers, rowIdPrefix }: { wagers: Wager[]; rowIdPrefix: string }) {
  return (
    <ul className={betListClass}>
      {wagers.map((w) => {
        const domId = rowDomId(rowIdPrefix, w.key)
        if (w.kind === 'parlay') return <PlacedParlay key={w.key} parlay={w.parlay} domId={domId} />
        const b = w.bet
        return (
          <Row
            key={w.key}
            domId={domId}
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
                  <div className="relative z-[1]">
                    <CancelBetButton betId={b.id} amount={b.amount} outcomeLabel={b.outcomeLabel} />
                  </div>
                )}
              </>
            }
          />
        )
      })}
    </ul>
  )
}

export function CancelledBetRows({ bets, rowIdPrefix }: { bets: MyCancelledBet[]; rowIdPrefix: string }) {
  return (
    <ul className={betListClass}>
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
