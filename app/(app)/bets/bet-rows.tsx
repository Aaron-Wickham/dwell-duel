import type { ReactNode } from 'react'
import { IntentLink } from '@/components/ui/intent-link'
import { LocalTime } from '@/components/ui/local-time'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import { ListCard, listCardsClass } from '@/components/ui/list-card'
import type { MyBet, MyCancelledBet } from '@/lib/bets/list-my-bets'
import type { Wager } from '@/lib/bets/list-my-wagers'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { rowTitleClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

// List cards on the page (D2), two across at lg, with a parlay spanning both (#393). Each keeps
// its own height (items-start); full-width parlays leave no holes beside a tall card.
const betListClass = cn(listCardsClass, 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-5')

function Row({
  domId,
  marketId,
  marketTitle,
  when,
  detail,
}: {
  domId: string
  marketId: string
  marketTitle: string
  // The day beside the title, right-aligned as on the markets board.
  when: ReactNode
  detail: ReactNode
}) {
  const titleId = `${domId}-title`
  return (
    <ListCard {...focusTarget(domId, titleId)} className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <IntentLink
          id={titleId}
          href={`/markets/${marketId}`}
          transitionTypes={['nav-forward']}
          className={cn(rowTitleClass, 'stretched-link min-w-0 break-words text-ink')}
        >
          {marketTitle}
        </IntentLink>
        <span className="shrink-0 text-sm whitespace-nowrap text-ink2">{when}</span>
      </div>
      <p className="text-sm">{detail}</p>
    </ListCard>
  )
}

// What the bet pays while it's open, then what it did: in the line, not a chip (#393).
function BetOutcome({ bet }: { bet: MyBet }) {
  const { result } = bet
  switch (result.kind) {
    case 'open':
    case 'awaiting':
      return (
        <>
          {bet.pays !== null && (
            <>
              {' · pays '}
              <span className="font-extrabold text-win">{formatDcAmount(bet.pays)}</span>
            </>
          )}
          {result.kind === 'awaiting' && ' · waiting for a result'}
        </>
      )
    case 'won':
      return (
        <>
          {' · won '}
          <span className="font-extrabold text-win">{formatDcAmount(result.payout)}</span>
        </>
      )
    case 'lost':
      return (
        <>
          {' · '}
          <span className="font-extrabold text-loss">lost</span>
        </>
      )
    case 'refunded':
      return <>{result.reason === 'no_winners' ? ' · refunded, no winners' : ' · refunded'}</>
  }
}

function BetWhen({ bet }: { bet: MyBet }) {
  if (bet.result.kind === 'awaiting') return <>Closed</>
  if (bet.result.kind === 'open') {
    return (
      <>
        <span className="sr-only">Closes </span>
        <LocalTime iso={bet.closeAt} format="day" />
      </>
    )
  }
  return (
    <>
      <span className="sr-only">Placed </span>
      <LocalTime iso={bet.placedAt} format="day" />
    </>
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
            when={<BetWhen bet={b} />}
            detail={
              <>
                {formatDcAmount(b.amount)} on <strong>{b.outcomeLabel}</strong>
                <BetOutcome bet={b} />
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
          when={
            <>
              <span className="sr-only">Cancelled </span>
              <LocalTime iso={b.cancelledAt} format="day" />
            </>
          }
          detail={
            <>
              {formatDcAmount(b.amount)} on <strong>{b.outcomeLabel}</strong> · refunded
            </>
          }
        />
      ))}
    </ul>
  )
}
