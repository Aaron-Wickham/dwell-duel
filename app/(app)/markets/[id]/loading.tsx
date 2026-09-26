import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors market detail: back link, status line and title, then from lg the two-column grid with
// the chart, outcomes and bets on the left and the bet card on the right.
export default function Loading() {
  return (
    <SkeletonScreen name="market" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-4/5 md:h-11 md:w-3/5" />
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
        <SkeletonCard className="lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-[220px] md:h-[300px]" />
        </SkeletonCard>
        <SkeletonCard className="gap-1 lg:col-start-1 lg:row-start-2">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 2 }, (_, i) => (
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
        <SkeletonCard className="gap-4 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <Skeleton className="h-6 w-32" />
          <SkeletonField />
          <SkeletonField />
          <Skeleton className="h-12" />
        </SkeletonCard>
        <SkeletonCard className="gap-1 lg:col-start-1 lg:row-start-3">
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
      </div>
    </SkeletonScreen>
  )
}
