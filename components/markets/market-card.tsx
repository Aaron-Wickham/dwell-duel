import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { cardClass } from '@/components/ui/card'
import { StatusChip } from '@/components/ui/status-chip'
import { LocalTime } from '@/components/ui/local-time'
import { cn } from '@/lib/utils'
import type { MarketCardStatus } from '@/lib/markets/market-status'

const STATUS_LABEL: Record<MarketCardStatus, string> = {
  open: 'Open',
  awaiting: 'Awaiting resolution',
  resolved: 'Resolved',
  voided: 'Voided',
}

const STATUS_TONE: Record<MarketCardStatus, 'open' | 'wait' | 'done' | 'lost' | 'void'> = {
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

export interface MarketCardProps {
  id: string
  title: string
  status: MarketCardStatus
  closeAt: string
  resolvedAt: string | null
  outcomes: MarketCardOutcome[]
  resolvedOutcomeLabel: string | null
}

export function MarketCard({ id, title, status, closeAt, resolvedAt, outcomes, resolvedOutcomeLabel }: MarketCardProps) {
  const hasBets = outcomes.some((outcome) => outcome.pct !== null)

  return (
    <article className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
        <span className="text-sm text-ink2">
          {status === 'open' && (
            <>
              Closes <LocalTime iso={closeAt} format="dateTime" />
            </>
          )}
          {status === 'resolved' && resolvedAt ? (
            <>
              Resolved <LocalTime iso={resolvedAt} format="day" />
            </>
          ) : status !== 'open' ? (
            <>
              Closed <LocalTime iso={closeAt} format="day" />
            </>
          ) : null}
        </span>
      </div>
      <h3 className="text-[18px] font-extrabold leading-[1.3] tracking-[-0.01em]">
        <Link href={`/markets/${id}`}>{title}</Link>
      </h3>
      {hasBets ? (
        <ul className="flex flex-col gap-1.5">
          {outcomes.map((outcome) => (
            <li key={outcome.id} className="flex min-h-7 items-center gap-2.5">
              <span className="flex-1 font-bold">{outcome.label}</span>
              <span className="min-w-12 text-right font-extrabold tabular-nums">{outcome.pct}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {outcomes.map((outcome) => (
              <span
                key={outcome.id}
                className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-sunk px-[9px] text-xs font-extrabold text-ink2"
              >
                {outcome.label}
              </span>
            ))}
          </div>
          <p className="text-ink2">no bets yet</p>
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
