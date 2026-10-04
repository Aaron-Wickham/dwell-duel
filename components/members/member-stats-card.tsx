import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChartColumn } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'
import { formatOdds } from '@/lib/parlays/odds'
import type { MemberStats, WinLoss } from '@/lib/members/stats'
import { cn } from '@/lib/utils'
import { figureInlineClass } from '@/components/ui/page'

function Stat({ label, children, detail }: { label: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm text-ink2">{label}</dt>
      <dd className={figureInlineClass}>{children}</dd>
      {detail && <dd className="text-sm text-ink2 break-words">{detail}</dd>}
    </div>
  )
}

function Record({ record }: { record: WinLoss }) {
  return (
    <>
      {record.won} won · {record.lost} lost
    </>
  )
}

const refunded = (record: WinLoss) => (record.refunded > 0 ? `${record.refunded} refunded` : undefined)

function SignedDc({ value }: { value: number }) {
  if (value === 0) return <>0 DC</>
  return (
    <span className={value > 0 ? 'text-win' : 'text-loss'}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value)} DC
    </span>
  )
}

const none = <span className="text-ink2">None yet</span>

export function MemberStatsCard({ stats }: { stats: MemberStats }) {
  const hasHistory = stats.settled > 0
  return (
    <SectionCard title="Stats" titleId="member-stats-title">
      {!hasHistory && (
        <EmptyState icon={ChartColumn} title="No settled bets yet.">
          Wins, losses and profit show here once a bet or parlay settles.
        </EmptyState>
      )}
      <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-4', !hasHistory && 'border-t border-line pt-3')}>
        {hasHistory && (
          <>
            <Stat label="Solo bets" detail={refunded(stats.bets)}>
              <Record record={stats.bets} />
            </Stat>
            <Stat label="Parlays" detail={refunded(stats.parlays)}>
              <Record record={stats.parlays} />
            </Stat>
            <Stat label="Net profit">
              <SignedDc value={stats.netProfit} />
            </Stat>
            <Stat
              label="Biggest win"
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
            <Stat
              label="Best parlay"
              detail={stats.bestParlay && `Paid ${stats.bestParlay.payout} DC`}
            >
              {stats.bestParlay ? `${formatOdds(stats.bestParlay.multiplierBp)}×` : none}
            </Stat>
          </>
        )}
        <Stat label="Markets created">{stats.marketsCreated}</Stat>
        <Stat label="Tasks completed">{stats.tasksCompleted}</Stat>
      </dl>
    </SectionCard>
  )
}

export function MemberStatsSkeleton() {
  return (
    <SkeletonCard>
      <Skeleton className="h-7 w-20" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  )
}
