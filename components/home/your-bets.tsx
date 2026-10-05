import type { ReactNode } from 'react'
import { Ticket } from 'lucide-react'
import { IntentLink } from '@/components/ui/intent-link'
import { LocalTime } from '@/components/ui/local-time'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { rowTitleClass } from '@/components/ui/page'
import type { ClosingMarket, ClosingWager } from '@/lib/home/closing-soon'
import { formatDcAmount } from '@/lib/format/dc'
import { cn } from '@/lib/utils'
import { HomeSection, SeeAll, homeRowsClass } from './home-section'

function Row({ href, title, detail, closeAt, now }: { href: string; title: string; detail?: ReactNode; closeAt: string; now: number }) {
  const closed = Date.parse(closeAt) <= now
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <IntentLink href={href} transitionTypes={['nav-forward']} className={cn(rowTitleClass, 'pressable hit-area break-words text-ink')}>
          {title}
        </IntentLink>
        {detail && <p className="text-sm">{detail}</p>}
      </div>
      <span className="shrink-0 text-sm whitespace-nowrap text-ink2">
        {closed ? (
          'Closed'
        ) : (
          <>
            <span className="sr-only">Closes </span>
            <LocalTime iso={closeAt} format="day" />
          </>
        )}
      </span>
    </li>
  )
}

function Pays({ amount, estimated = false }: { amount: number; estimated?: boolean }) {
  return (
    <span className="font-extrabold text-win">
      {estimated ? '~' : ''}
      {formatDcAmount(amount)}
    </span>
  )
}

// Home's next few open bets and parlays, soonest to close first (#388), as divided rows: each is
// a data row, not a card. With none open, the markets closing soonest stand in.
export function YourBets({
  wagers,
  openCount,
  markets,
  now,
}: {
  wagers: ClosingWager[]
  // Every open bet and parlay, for "See all N".
  openCount: number
  markets: ClosingMarket[]
  now: number
}) {
  if (wagers.length === 0) {
    const browse = (
      <IntentLink
        href="/markets"
        transitionTypes={TAB_TRANSITION}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start no-underline')}
      >
        Browse markets
      </IntentLink>
    )
    return (
      <HomeSection title="Your bets" titleId="your-bets-title">
        {markets.length === 0 ? (
          <div className="pt-2">
            <EmptyState icon={Ticket} title="No open bets." action={browse}>
              New markets show up on Markets.
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink2">No open bets. These markets close soonest.</p>
            <ul className={homeRowsClass}>
              {markets.map((m) => (
                <Row key={m.id} href={`/markets/${m.id}`} title={m.title} closeAt={m.closeAt} now={now} />
              ))}
            </ul>
            <div className="pt-2">{browse}</div>
          </>
        )}
      </HomeSection>
    )
  }

  return (
    <HomeSection title="Your bets" titleId="your-bets-title" action={<SeeAll href="/bets" label={`See all ${openCount}`} />}>
      <ul className={homeRowsClass}>
        {wagers.map((w) =>
          w.kind === 'bet' ? (
            <Row
              key={w.key}
              href={`/markets/${w.marketId}`}
              title={w.marketTitle}
              closeAt={w.closeAt}
              now={now}
              detail={
                <>
                  {formatDcAmount(w.amount)} on {w.outcomeLabel}
                  {w.payout !== null && (
                    <>
                      {' · pays '}
                      <Pays amount={w.payout} />
                    </>
                  )}
                </>
              }
            />
          ) : (
            <Row
              key={w.key}
              href={`/parlays/${w.parlayId}`}
              title={`Parlay · ${w.legCount} picks`}
              closeAt={w.closeAt}
              now={now}
              detail={
                <>
                  {formatDcAmount(w.stake)} · pays <Pays amount={w.payout} estimated={w.estimated} /> if all win
                </>
              }
            />
          ),
        )}
      </ul>
    </HomeSection>
  )
}
