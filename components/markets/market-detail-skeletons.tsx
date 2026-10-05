import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Stand-ins for the sections market detail streams (app/(app)/markets/[id]/page.tsx). Each sits in
// its section's own wrapper, which carries the section's place in the phone order and the lg rail
// or main column, so the skeletons carry no placement of their own.

// The page renders one combined <LoadingStatus /> instead (app/(app)/markets/[id]/page.tsx),
// since these sections stream independently and can be pending at the same time.

export function MarketChartSkeleton() {
  return (
    <SkeletonScreen name="market-chart" announce={false}>
      <SkeletonCard>
        <Skeleton className="h-6 w-44" />
        {/* The chart's bet count and range picker row, the plot, then its tick labels. */}
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-11 w-40" />
        </div>
        <Skeleton className="h-[220px] md:h-[300px]" />
        <Skeleton className="h-5 w-full" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}

// Shown only to a viewer my_market_position found something for, with a row per bet or parlay.
export function MarketPositionSkeleton({ rows }: { rows: number }) {
  return (
    <SkeletonScreen name="market-position" announce={false}>
      <SkeletonCard className="gap-1 border-2 border-ink">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-56 max-w-full" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: Math.min(rows, 4) }, (_, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-3">
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-44 max-w-full" />
              </div>
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}

// A row per outcome: its name over a payout line, its chance, and, while it takes bets, Add. Once
// it doesn't, the card opens with where the market stands (the result, the void or the wait).
export function MarketOutcomesSkeleton({ outcomes, canBet }: { outcomes: number; canBet: boolean }) {
  return (
    <SkeletonScreen name="market-outcomes" announce={false}>
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-28" />
        {!canBet && <Skeleton className="mb-2 h-14 rounded-tile" />}
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: outcomes }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="flex grow flex-col gap-1.5">
                <Skeleton className="h-5 w-20" />
                {canBet && <Skeleton className="h-4 w-24" />}
              </div>
              <Skeleton className="h-7 w-14" />
              {canBet && <Skeleton className="h-11 w-20" />}
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}

export function MarketBetsSkeleton() {
  return (
    <SkeletonScreen name="market-bets" announce={false}>
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-16" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-[52px] items-center gap-3 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-52 max-w-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}

export function MarketCommentsSkeleton() {
  return (
    <SkeletonScreen name="market-comments" announce={false}>
      <SkeletonCard className="gap-3">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
        <SkeletonField />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
