import type { ReactNode } from 'react'
import { IntentLink } from '@/components/ui/intent-link'
import { LocalTime } from '@/components/ui/local-time'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { rowTitleClass } from '@/components/ui/page'
import type { ClosingMarket, ClosingWager } from '@/lib/home/closing-soon'
import { formatDcAmount } from '@/lib/format/dc'
import { cn } from '@/lib/utils'
import { ListCard, listCardsClass } from '@/components/ui/list-card'
import { StatusChip } from '@/components/ui/status-chip'
import { PickChip } from '@/components/markets/pick-chip'
import { h2Class } from '@/components/ui/page'
import { HomeSection, SeeAll, homeRowsClass } from './home-section'

// "Closes Oct 28", or "Closes 6 PM" within a day (HOME-3): a bare date could be when it was placed.
function Closes({ closeAt, now }: { closeAt: string; now: number }) {
  return (
    <>
      Closes <LocalTime iso={closeAt} format="close" now={now} />
    </>
  )
}

// The whole row opens the market (HOME-6), not only its title.
function Row({ href, title, closeAt, now }: { href: string; title: string; closeAt: string; now: number }) {
  const closed = Date.parse(closeAt) <= now
  return (
    <li className="pressable hover-tint relative flex items-center justify-between gap-3 py-3">
      <IntentLink href={href} transitionTypes={['nav-forward']} className={cn(rowTitleClass, 'stretched-link min-w-0 break-words text-ink')}>
        {title}
      </IntentLink>
      <span className="shrink-0 text-sm whitespace-nowrap text-ink2">{closed ? 'Closed' : <Closes closeAt={closeAt} now={now} />}</span>
    </li>
  )
}

// One open bet or parlay as a card (#438): the title with when it closes, then the stake, the
// pick in its colour and what it pays. A closed one says it's waiting for a result instead of a day.
function BetCard({ href, title, detail, closeAt, now }: { href: string; title: string; detail: ReactNode; closeAt: string; now: number }) {
  const closed = Date.parse(closeAt) <= now
  return (
    <ListCard className="flex flex-col gap-2 bg-surface">
      <div className="flex items-start justify-between gap-3">
        <IntentLink href={href} transitionTypes={['nav-forward']} className={cn(rowTitleClass, 'stretched-link min-w-0 break-words text-ink')}>
          {title}
        </IntentLink>
        {closed ? (
          <StatusChip tone="wait" size="sm" className="shrink-0">
            Waiting for a result
          </StatusChip>
        ) : (
          <span className="shrink-0 pt-0.5 text-sm whitespace-nowrap text-ink2">
            <Closes closeAt={closeAt} now={now} />
          </span>
        )}
      </div>
      <p className="text-sm">{detail}</p>
    </ListCard>
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

// Home's next few open bets and parlays, soonest to close first (#388), as cards (#438). With none
// open, the markets closing soonest stand in, as rows.
export function YourBets({
  wagers,
  openCount,
  markets,
  now,
}: {
  wagers: ClosingWager[]
  // Every open bet and parlay, for "See all N"; null when it couldn't be read.
  openCount: number | null
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
            <EmptyState title="No open bets." action={browse}>
              Add a pick from any market to place your first bet.
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

  // Cards on the page, not inside a section card, at every width (#438).
  return (
    <section aria-labelledby="your-bets-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="your-bets-title" className={h2Class}>
          Your bets
        </h2>
        <SeeAll href="/bets" label={openCount === null ? 'See all' : `See all ${openCount}`} />
      </div>
      <ul className={cn(listCardsClass, 'lg:grid lg:grid-cols-2')}>
        {wagers.map((w) =>
          w.kind === 'bet' ? (
            <BetCard
              key={w.key}
              href={`/markets/${w.marketId}`}
              title={w.marketTitle}
              closeAt={w.closeAt}
              now={now}
              detail={
                <>
                  {formatDcAmount(w.amount)} on <PickChip label={w.outcomeLabel} />
                  {w.payout !== null && (
                    <>
                      {' · Pays '}
                      <Pays amount={w.payout} />
                    </>
                  )}
                </>
              }
            />
          ) : (
            <BetCard
              key={w.key}
              href={`/parlays/${w.parlayId}`}
              title={`Parlay · ${w.legCount} picks`}
              closeAt={w.closeAt}
              now={now}
              detail={
                <>
                  {formatDcAmount(w.stake)} · Pays <Pays amount={w.payout} estimated={w.estimated} /> if all win
                </>
              }
            />
          ),
        )}
      </ul>
    </section>
  )
}
