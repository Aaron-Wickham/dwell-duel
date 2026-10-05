import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the markets list: header with Create market, the status tabs (Open, Waiting and Resolved
// measure 276px from md) with the search beside them (an icon on a phone, a field from md), then a
// column of market cards, three across from lg. The category chips are left out: they show only
// while more than one category holds markets, behind the search button on a phone, and beside the
// tabs from lg.
// It sits in the (list) group because a loading.tsx also wraps every segment below it, and market
// detail's real 404 needs nothing above it that streams.
export default function Loading() {
  return (
    <SkeletonScreen name="markets" className={pageClass}>
      <SkeletonPageHeader action />
      <div className="flex items-center gap-2 md:gap-3">
        <Skeleton className="h-[52px] min-w-0 flex-1 rounded-tile md:w-[276px] md:flex-none" />
        <Skeleton className="size-11 shrink-0 rounded-control md:ml-auto md:h-12 md:w-80" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i}>
            <Skeleton className="h-6 w-4/5" />
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-16" />
            <Skeleton className="h-4 w-44" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonScreen>
  )
}
