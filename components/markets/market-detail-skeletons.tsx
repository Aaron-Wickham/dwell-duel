import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Stand-ins for the sections market detail streams (app/(app)/markets/[id]/page.tsx). Each one
// carries its section's grid placement, so from lg the two-column layout holds while they load.

// The page renders one combined <LoadingStatus /> instead (app/(app)/markets/[id]/page.tsx),
// since these sections stream independently and can be pending at the same time.

export function MarketChartSkeleton() {
  return (
    <SkeletonScreen name="market-chart" announce={false} className="lg:col-start-1 lg:row-start-1">
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

// The outcomes card and the bet column stream as one section, so they share one fallback.
export function MarketActionsSkeleton({ outcomes }: { outcomes: number }) {
  return (
    <>
      <SkeletonScreen name="market-outcomes" announce={false} className="lg:col-start-1 lg:row-start-2">
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
      <SkeletonScreen
        name="market-bet-form"
        announce={false}
        className="flex flex-col gap-5 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:gap-7"
      >
        {/* "Place a bet" or "Betting closed": a heading and a short paragraph, nothing to fill in. */}
        <SkeletonCard className="gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
        </SkeletonCard>
      </SkeletonScreen>
    </>
  )
}

export function MarketBetsSkeleton() {
  return (
    <SkeletonScreen name="market-bets" announce={false} className="lg:col-start-1 lg:row-start-3">
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
    <SkeletonScreen name="market-comments" announce={false} className="lg:col-start-1 lg:row-start-4">
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
