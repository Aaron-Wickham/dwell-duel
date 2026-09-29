import { pageClass } from '@/components/ui/page'
import { cn } from '@/lib/utils'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors My bets: the tabs (three bet statuses and Coins), then one tab's list, a grid of cards at lg.
export default function Loading() {
  return (
    <SkeletonScreen name="bets" className={pageClass}>
      <SkeletonPageHeader description />
      <Skeleton className="h-[52px] w-full rounded-[14px] md:w-96" />
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-col divide-y divide-line lg:grid lg:grid-cols-3 lg:gap-4 lg:divide-y-0 lg:py-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start justify-between gap-3 py-3 lg:min-h-[132px] lg:flex-col lg:rounded-[14px] lg:border lg:border-line lg:p-4',
                // A phone shows four rows, as before; lg fills two rows of three cards.
                i >= 4 && 'hidden lg:flex',
              )}
            >
              <div className="flex w-full grow flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
