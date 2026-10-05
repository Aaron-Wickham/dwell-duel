import { Fragment } from 'react'
import type { MarketKind } from '@/lib/markets/kind'
import { IntentLink } from '@/components/ui/intent-link'
import { cardClass, cardPaddingClass } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { LocalTime } from '@/components/ui/local-time'
import { SERIES_BG } from '@/components/markets/series-classes'
import { MarketSparkline } from '@/components/markets/market-sparkline'
import { ClosesLabel } from '@/components/markets/closes-label'
import { CategoryChip } from '@/components/markets/category-chip'
import type { ChartOutcome } from '@/components/markets/probability-chart'
import { isPositiveOutcome, outcomeSeries } from '@/lib/markets/outcome-series'
import type { SeriesPoint } from '@/lib/markets/probability-series'
import { chartClosedAt, type MarketCardStatus } from '@/lib/markets/market-status'
import { focusTarget } from '@/lib/pagination/row-id'
import { figureClass, figureInlineClass, rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// A multiple-choice card's legend names this many outcomes, then "+N more".
const LEGEND_OUTCOMES = 3

export interface MarketCardOutcome {
  id: string
  label: string
  pct: number | null
}

export interface MarketCardChart {
  outcomes: ChartOutcome[]
  points: SeriesPoint[]
  now: number
}

export interface MarketCardProps {
  id: string
  title: string
  status: MarketCardStatus
  kind: MarketKind
  edited?: boolean
  // Its category's name (0103), when the list shows categories at all (#387).
  category?: string | null
  closeAt: string
  resolvedAt: string | null
  // The first resolution or the void (0066); dates a void and ends the chart's live zone.
  settledAt?: string | null
  // In the order the market lists them: Yes before No, Over before Under.
  outcomes: MarketCardOutcome[]
  resolvedOutcomeLabel: string | null
  chart?: MarketCardChart
  // How many points the leading outcome's chance moved this week; null without a week of history.
  weeklyChange?: number | null
  betCount?: number
  domId?: string
  // The page's render time, for "Closes in 2h" on a market closing within a day.
  now?: number
  // Create market's live preview: a market not made yet, so its title leads nowhere and its close
  // time may still be blank.
  preview?: boolean
}

// The outcome a card leads with: a two-outcome market's Yes (or Over), which its chart draws, or
// the favourite of several (the first listed on a tie).
export function leadingOutcome(kind: MarketKind, outcomes: MarketCardOutcome[]): MarketCardOutcome | undefined {
  if (kind !== 'multiple_choice') return outcomes.find((o) => isPositiveOutcome(kind, o.label)) ?? outcomes[0]
  return outcomes.reduce<MarketCardOutcome | undefined>((best, o) => (best === undefined || (o.pct ?? 0) > (best.pct ?? 0) ? o : best), undefined)
}

// The arrow pairs with the colour, and the words with both, so the direction never rests on colour.
function WeeklyChange({ change }: { change: number }) {
  const up = change > 0
  return (
    <span className={cn('text-sm font-bold whitespace-nowrap', up ? 'text-win' : 'text-loss')}>
      <span aria-hidden="true">{up ? '▲' : '▼'} </span>
      <span className="sr-only">{up ? 'Up ' : 'Down '}</span>
      {Math.abs(change)} this week
    </span>
  )
}

function MetaWhen({
  status,
  closeAt,
  resolvedAt,
  settledAt,
  now,
}: Pick<MarketCardProps, 'status' | 'closeAt' | 'resolvedAt' | 'settledAt' | 'now'>) {
  if (status === 'open') {
    if (!closeAt) return <>No close time yet</>
    if (now !== undefined) return <ClosesLabel closeAt={closeAt} now={now} />
    return (
      <>
        Closes <LocalTime iso={closeAt} format="dateTime" />
      </>
    )
  }
  if (status === 'awaiting') return <>Waiting for a result</>
  if (status === 'resolved' && resolvedAt) {
    return (
      <>
        Resolved <LocalTime iso={resolvedAt} format="day" />
      </>
    )
  }
  if (status === 'voided' && settledAt) {
    return (
      <>
        Voided <LocalTime iso={settledAt} format="day" />
      </>
    )
  }
  return (
    <>
      Closed <LocalTime iso={closeAt} format="day" />
    </>
  )
}

export function MarketCard({
  id,
  title,
  status,
  kind,
  edited = false,
  category = null,
  closeAt,
  resolvedAt,
  settledAt = null,
  outcomes,
  resolvedOutcomeLabel,
  chart,
  weeklyChange = null,
  betCount,
  domId,
  now,
  preview = false,
}: MarketCardProps) {
  // Every outcome has a seed pool (0041), so only a market that closed before seeding, with no
  // bets on it, has no odds.
  const hasBets = outcomes.some((outcome) => outcome.pct !== null)
  // Self-labelling (the default `focusTarget` behaviour) would name the card from its whole
  // content -- the chart's own aria-label, then the legend -- so the card is labelled by its
  // title alone instead.
  const titleId = domId ? `${domId}-title` : undefined
  const lead = leadingOutcome(kind, outcomes)
  const legend =
    kind === 'multiple_choice' && hasBets
      ? outcomes
          .map((outcome, index) => ({ ...outcome, series: outcomeSeries(kind, outcome.label, index) }))
          .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
      : []

  return (
    <article
      {...focusTarget(domId, titleId)}
      className={cn(
        cardClass,
        `relative flex min-w-0 flex-col gap-3 ${cardPaddingClass}`,
        // An off-screen card skips layout and paint; the size stands in for it until it scrolls near.
        !preview && 'pressable hover-lift [contain-intrinsic-size:auto_240px] [content-visibility:auto]',
      )}
    >
      {category && <CategoryChip name={category} className="self-start" />}
      <h3 id={titleId} className={cn(rowTitleClass, 'break-words')}>
        {preview ? (
          title
        ) : (
          <IntentLink href={`/markets/${id}`} transitionTypes={['nav-forward']} className="stretched-link text-ink no-underline">
            {title}
          </IntentLink>
        )}
      </h3>
      {!hasBets ? (
        <>
          <div className="flex flex-wrap gap-2">
            {outcomes.map((outcome) => (
              <StatusChip key={outcome.id} tone="void" size="sm" className="h-auto min-h-6 max-w-full whitespace-normal break-words py-0.5">
                {outcome.label}
              </StatusChip>
            ))}
          </div>
          <p className="text-ink2">No bets were placed.</p>
        </>
      ) : (
        <>
          {status === 'resolved' && resolvedOutcomeLabel ? (
            <p className={cn(figureInlineClass, 'break-words')}>{resolvedOutcomeLabel} won</p>
          ) : status === 'voided' ? (
            <p className={cn(figureInlineClass, 'text-ink2')}>Voided</p>
          ) : (
            lead && (
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={figureClass}>{lead.pct}%</span>
                <span className="min-w-0 break-words font-bold">{lead.label}</span>
                {weeklyChange !== null && weeklyChange !== 0 && <WeeklyChange change={weeklyChange} />}
              </p>
            )
          )}
          {chart && (
            <MarketSparkline
              kind={kind}
              outcomes={chart.outcomes}
              points={chart.points}
              now={chart.now}
              closedAt={chartClosedAt(status, closeAt, settledAt)}
              resolvedLabel={status === 'resolved' ? resolvedOutcomeLabel : null}
            />
          )}
          {legend.length > 0 && (
            <p className="text-sm">
              {legend.slice(0, LEGEND_OUTCOMES).map((outcome, index) => (
                <Fragment key={outcome.id}>
                  {index > 0 && <span className="text-ink2"> · </span>}
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', SERIES_BG[outcome.series])} />
                    <span className="break-words">
                      {outcome.label} {outcome.pct}%
                    </span>
                  </span>
                </Fragment>
              ))}
              {legend.length > LEGEND_OUTCOMES && <span className="text-ink2"> · +{legend.length - LEGEND_OUTCOMES} more</span>}
            </p>
          )}
        </>
      )}
      <p className="mt-auto text-sm text-ink2">
        <MetaWhen status={status} closeAt={closeAt} resolvedAt={resolvedAt} settledAt={settledAt} now={now} />
        {betCount !== undefined && ` · ${betCount === 1 ? '1 bet' : `${betCount.toLocaleString('en-US')} bets`}`}
        {edited && ' · Edited'}
      </p>
    </article>
  )
}
