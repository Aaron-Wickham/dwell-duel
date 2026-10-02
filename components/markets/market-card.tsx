import { formatLine, type MarketKind } from '@/lib/markets/kind'
import { IntentLink } from '@/components/ui/intent-link'
import { Trophy } from 'lucide-react'
import { cardClass } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { LocalTime } from '@/components/ui/local-time'
import { SERIES_BG } from '@/components/markets/series-classes'
import { MarketSparkline } from '@/components/markets/market-sparkline'
import { ClosesSoonChip } from '@/components/markets/closes-soon-chip'
import { CategoryChip } from '@/components/markets/category-chip'
import type { ChartOutcome } from '@/components/markets/probability-chart'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import type { SeriesPoint } from '@/lib/markets/probability-series'
import { chartClosedAt, type MarketCardStatus } from '@/lib/markets/market-status'
import { focusTarget } from '@/lib/pagination/row-id'
import { rowTitleClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'

// What a market's state is called, everywhere it's shown: here, and on the market page's chip.
export const STATUS_LABEL: Record<MarketCardStatus, string> = {
  open: 'Open',
  awaiting: 'Awaiting resolution',
  resolved: 'Resolved',
  voided: 'Voided',
}

export const STATUS_TONE: Record<MarketCardStatus, 'open' | 'wait' | 'done' | 'lost' | 'void'> = {
  open: 'open',
  awaiting: 'wait',
  resolved: 'done',
  voided: 'void',
}

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
  // An over/under's line, shown as an Over/Under chip.
  line?: number | null
  edited?: boolean
  // Its category's name (0103).
  category?: string | null
  closeAt: string
  resolvedAt: string | null
  // The first resolution or the void (0066); dates a void and ends the chart's live zone.
  settledAt?: string | null
  outcomes: MarketCardOutcome[]
  resolvedOutcomeLabel: string | null
  chart?: MarketCardChart
  domId?: string
  // The page's render time, for the "Closes in 2h" chip on a market closing within a day.
  now?: number
  // Create market's live preview: a market not made yet, so its title leads nowhere and its close
  // time may still be blank.
  preview?: boolean
}

export function MarketCard({
  id,
  title,
  status,
  kind,
  line = null,
  edited = false,
  category = null,
  closeAt,
  resolvedAt,
  settledAt = null,
  outcomes,
  resolvedOutcomeLabel,
  chart,
  domId,
  now,
  preview = false,
}: MarketCardProps) {
  // Every outcome has a seed pool (0041), so only a market that closed before seeding, with no
  // bets on it, has no odds.
  const hasBets = outcomes.some((outcome) => outcome.pct !== null)
  // Self-labelling (the default `focusTarget` behaviour) would name the card from its whole
  // content -- the chart's own aria-label, then the odds list again -- so the card is labelled by
  // its title alone instead.
  const titleId = domId ? `${domId}-title` : undefined

  return (
    <article {...focusTarget(domId, titleId)} className={cn(cardClass, 'relative flex min-w-0 flex-col gap-3 p-[18px]', !preview && 'pressable hover-lift')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
        {status === 'open' && now !== undefined && <ClosesSoonChip closeAt={closeAt} now={now} />}
        {kind === 'over_under' && line !== null && <StatusChip tone="void">Over/Under {formatLine(line)}</StatusChip>}
        {category && <CategoryChip name={category} />}
        <span className="text-sm text-ink2">
          {status === 'open' &&
            (closeAt ? (
              <>
                Closes <LocalTime iso={closeAt} format="dateTime" />
              </>
            ) : (
              'No close time yet'
            ))}
          {status === 'resolved' && resolvedAt ? (
            <>
              Resolved <LocalTime iso={resolvedAt} format="day" />
            </>
          ) : status === 'voided' && settledAt ? (
            <>
              Voided <LocalTime iso={settledAt} format="day" />
            </>
          ) : status !== 'open' ? (
            <>
              Closed <LocalTime iso={closeAt} format="day" />
            </>
          ) : null}
          {edited && ' · Edited'}
        </span>
      </div>
      <h3 id={titleId} className={cn(rowTitleClass, 'break-words')}>
        {preview ? (
          title
        ) : (
          <IntentLink href={`/markets/${id}`} transitionTypes={['nav-forward']} className="stretched-link no-underline">
            {title}
          </IntentLink>
        )}
      </h3>
      {hasBets ? (
        <>
          {chart && (
            <MarketSparkline
              outcomes={chart.outcomes}
              points={chart.points}
              now={chart.now}
              closedAt={chartClosedAt(status, closeAt, settledAt)}
              resolvedLabel={status === 'resolved' ? resolvedOutcomeLabel : null}
            />
          )}
          <ul className="flex flex-col gap-1.5">
            {outcomes.map((outcome, index) => (
              <li key={outcome.id} className="flex min-h-7 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 shrink-0 rounded-full', SERIES_BG[outcomeSeries(kind, outcome.label, index)])}
                />
                <span className="min-w-0 flex-1 break-words font-bold">{outcome.label}</span>
                <span className="min-w-12 text-right font-extrabold tabular-nums">{outcome.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {outcomes.map((outcome) => (
              <span
                key={outcome.id}
                className="inline-flex min-h-6 max-w-full items-center rounded-full bg-sunk px-[9px] py-0.5 text-xs font-extrabold text-ink2 break-words"
              >
                {outcome.label}
              </span>
            ))}
          </div>
          <p className="text-ink2">No bets were placed.</p>
        </>
      )}
      {status === 'resolved' && resolvedOutcomeLabel && (
        <p className="flex items-center gap-2 font-extrabold text-win">
          <Trophy aria-hidden="true" className="size-5" />
          <span>Winning outcome: {resolvedOutcomeLabel}</span>
        </p>
      )}
    </article>
  )
}
