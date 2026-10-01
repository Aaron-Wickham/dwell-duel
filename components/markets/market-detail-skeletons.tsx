import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Stand-ins for the sections market detail streams (app/(app)/markets/[id]/page.tsx). Each one
// carries its section's grid placement, so from lg the two-column layout holds while they load.
// The chart and outcomes sit in the page's left-top column wrapper, and bets and comments in its
// left-bottom one, so those take their placement from the wrapper.

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
    <SkeletonScreen name="market-position" announce={false} className="lg:col-start-2 lg:row-start-1 lg:mb-7">
      <SkeletonCard className="gap-1 border-2 border-primary">
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

export function MarketOutcomesSkeleton({ outcomes }: { outcomes: number }) {
  return (
    <SkeletonScreen name="market-outcomes" announce={false}>
      <SkeletonCard className="gap-1">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: outcomes }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 py-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-2 rounded-full" />
              <div className="flex min-h-11 items-center justify-between gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-11 w-36" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}

// The bet column's grid rows from lg: under Your position when there is one, otherwise from the
// top, level with the chart (app/(app)/markets/[id]/page.tsx).
export function actionsPlacement(hasPosition: boolean): string {
  return hasPosition ? 'lg:row-span-2 lg:row-start-2' : 'lg:row-span-3 lg:row-start-1'
}

export function MarketActionsSkeleton({ hasPosition }: { hasPosition: boolean }) {
  return (
    <SkeletonScreen
      name="market-bet-form"
      announce={false}
      className={`flex flex-col gap-5 lg:col-start-2 lg:gap-7 ${actionsPlacement(hasPosition)}`}
    >
      {/* "Place a bet" or "Betting closed": a heading and a short paragraph, nothing to fill in. */}
      <SkeletonCard className="gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
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
