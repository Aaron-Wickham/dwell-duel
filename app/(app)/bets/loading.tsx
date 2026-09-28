import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors My bets: the status tabs, then one tab's list.
export default function Loading() {
  return (
    <SkeletonScreen name="bets" className={pageClass}>
      <SkeletonPageHeader description />
      <Skeleton className="h-[52px] w-full rounded-[14px] md:w-80" />
      <SkeletonCard className="max-w-[820px] gap-1">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-3">
              <div className="flex grow flex-col gap-2">
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
