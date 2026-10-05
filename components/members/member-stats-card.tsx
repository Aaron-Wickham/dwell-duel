import type { ReactNode } from 'react'
import Link from 'next/link'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { formatOdds } from '@/lib/parlays/odds'
import type { MemberStats, WinLoss } from '@/lib/members/stats'
import { cn } from '@/lib/utils'
import { figureInlineClass } from '@/components/ui/page'
import { formatDcAmount, formatSignedDcAmount } from '@/lib/format/dc'

function Stat({
  label,
  children,
  detail,
  wide = false,
}: {
  label: string
  children: ReactNode
  detail?: ReactNode
  // Across both columns, for a cell whose detail is a market's title (VIZ-17).
  wide?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', wide && 'col-span-2')}>
      <dt className="text-sm text-ink2">{label}</dt>
      <dd className={cn(figureInlineClass, 'whitespace-nowrap')}>{children}</dd>
      {detail && <dd className="text-sm text-ink2 break-words">{detail}</dd>}
    </div>
  )
}

// "17–12" fits half a phone's card on one line, where "17 won · 12 lost" wrapped (VIZ-17); the
// words stay for screen readers, and the share won goes under it.
function Record({ record }: { record: WinLoss }) {
  return (
    <>
      <span aria-hidden="true">
        {record.won}–{record.lost}
      </span>
      <span className="sr-only">
        {record.won} won, {record.lost} lost
      </span>
    </>
  )
}

function recordDetail(record: WinLoss): string | undefined {
  const decided = record.won + record.lost
  const parts = [
    decided > 0 ? `${Math.round((record.won / decided) * 100)}% won` : null,
    record.refunded > 0 ? `${record.refunded} refunded` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function SignedDc({ value }: { value: number }) {
  if (value === 0) return <>{formatSignedDcAmount(0)}</>
  return <span className={value > 0 ? 'text-win' : 'text-loss'}>{formatSignedDcAmount(value)}</span>
}

const none = <span className="text-sm font-normal text-ink2">None yet</span>

export function MemberStatsCard({ stats }: { stats: MemberStats }) {
  const hasHistory = stats.settled > 0
  return (
    <SectionCard title="Stats" titleId="member-stats-title">
      {!hasHistory && (
        <EmptyState title="No settled bets yet.">
          Wins, losses and profit show here once a bet or parlay settles.
        </EmptyState>
      )}
      <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-4', !hasHistory && 'border-t border-line pt-3')}>
        {hasHistory && (
          <>
            <Stat label="Solo bets" detail={recordDetail(stats.bets)}>
              <Record record={stats.bets} />
            </Stat>
            <Stat label="Parlays" detail={recordDetail(stats.parlays)}>
              <Record record={stats.parlays} />
            </Stat>
            <Stat label="Net profit">
              <SignedDc value={stats.netProfit} />
            </Stat>
            <Stat
              label="Best parlay"
              detail={stats.bestParlay && `Paid ${formatDcAmount(stats.bestParlay.payout)}`}
            >
              {stats.bestParlay ? `${formatOdds(stats.bestParlay.multiplierBp)}×` : none}
            </Stat>
            <Stat
              label="Biggest win"
              wide
              detail={
                stats.biggestWin && (
                  <Link
                    href={`/markets/${stats.biggestWin.marketId}`}
                    transitionTypes={['nav-forward']}
                    className="hit-area"
                  >
                    {stats.biggestWin.marketTitle}
                  </Link>
                )
              }
            >
              {stats.biggestWin ? <SignedDc value={stats.biggestWin.amount} /> : none}
            </Stat>
          </>
        )}
        <Stat label="Markets created">{stats.marketsCreated}</Stat>
        <Stat label="Tasks completed">{stats.tasksCompleted}</Stat>
      </dl>
    </SectionCard>
  )
}

// Drawn like a member with history (the taller card), line for line, so the real card doesn't
// push the page down when it streams in (ST-4).
function StatSkeleton({ detail = false, wide = false }: { detail?: boolean; wide?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', wide && 'col-span-2')}>
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-20" />
      </div>
      <div className="flex h-[25px] items-center">
        <Skeleton className="h-5 w-16" />
      </div>
      {detail && (
        <div className="flex h-5 items-center">
          <Skeleton className={cn('h-3.5', wide ? 'w-48 max-w-full' : 'w-16')} />
        </div>
      )}
    </div>
  )
}

export function MemberStatsSkeleton() {
  return (
    <SkeletonCard>
      <div className="flex h-6 items-center md:h-[26px]">
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <StatSkeleton detail />
        <StatSkeleton detail />
        <StatSkeleton />
        <StatSkeleton detail />
        <StatSkeleton detail wide />
        <StatSkeleton />
        <StatSkeleton />
      </div>
    </SkeletonCard>
  )
}
