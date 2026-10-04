import type { ReactNode } from 'react'
import { IntentLink } from '@/components/ui/intent-link'
import { ResultChip } from '@/components/bets/result-chip'
import { LocalTime } from '@/components/ui/local-time'
import { StatusChip } from '@/components/ui/status-chip'
import { PlacedParlay } from '@/components/parlays/placed-parlay'
import { ListCard, listCardsClass } from '@/components/ui/list-card'
import type { MyCancelledBet } from '@/lib/bets/list-my-bets'
import type { Wager } from '@/lib/bets/list-my-wagers'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { rowTitleClass } from '@/components/ui/page'
import { formatDcAmount } from '@/lib/format/dc'

// List cards, three across at lg. Each keeps its own height (items-start), so a tall parlay
// doesn't leave blank space in its neighbours.
const betListClass = cn(listCardsClass, 'lg:grid lg:grid-cols-3 lg:items-start lg:gap-5')

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
    <ListCard
      {...focusTarget(domId, titleId)}
      className="flex items-start justify-between gap-3 lg:flex-col lg:justify-start"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <IntentLink
          id={titleId}
          href={`/markets/${marketId}`}
          transitionTypes={['nav-forward']}
          className={cn(rowTitleClass, 'stretched-link break-words text-ink')}
        >
          {marketTitle}
        </IntentLink>
        <p className="text-sm text-ink2">{detail}</p>
      </div>
      <div className="flex min-w-0 max-w-full shrink-0 flex-col items-end gap-2 lg:mt-auto lg:w-full lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        {aside}
      </div>
    </ListCard>
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
                {formatDcAmount(b.amount)} on {b.outcomeLabel} · {b.result.kind === 'open' ? 'Closes' : 'Placed'}{' '}
                <LocalTime iso={b.result.kind === 'open' ? b.closeAt : b.placedAt} format="dateTime" />
              </>
            }
            aside={<ResultChip result={b.result} />}
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
              {formatDcAmount(b.amount)} on {b.outcomeLabel} · Cancelled <LocalTime iso={b.cancelledAt} format="dateTime" />
            </>
          }
          aside={<StatusChip tone="void">Refunded</StatusChip>}
        />
      ))}
    </ul>
  )
}
