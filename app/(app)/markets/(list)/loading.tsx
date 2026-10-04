import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the markets list: header with Create market, the search, the filter tabs and the category chips, then one status group
// of market cards, three across from lg.
// It sits in the (list) group because a loading.tsx also wraps every segment below it, and market
// detail's real 404 needs nothing above it that streams.
export default function Loading() {
  return (
    <SkeletonScreen name="markets" className={pageClass}>
      <SkeletonPageHeader action />
      <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-center">
        <Skeleton className="h-12 w-full rounded-control md:max-w-[520px] md:flex-1" />
        <div className="md:basis-full">
          <Skeleton className="h-[52px] w-full rounded-tile md:w-80" />
        </div>
        <div className="flex gap-2 overflow-hidden md:basis-full">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-[84px]" />
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 2 }, (_, j) => (
                  <div key={j} className="flex min-h-7 items-center gap-2.5">
                    <Skeleton className="size-2.5 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="ml-auto h-4 w-10" />
                  </div>
                ))}
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
