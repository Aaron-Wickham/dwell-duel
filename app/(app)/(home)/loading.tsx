import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Home: greeting, balance hero, and the tile list (a grid from lg).
export default function Loading() {
  return (
    <SkeletonScreen name="home" className={pageClass}>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-3 rounded-[22px] bg-hero px-[22px] pt-[22px] pb-6 md:px-9 md:py-8">
        <Skeleton className="h-4 w-24 bg-on-hero/15" />
        <Skeleton className="h-11 w-56 bg-on-hero/15 md:h-[60px] md:w-80" />
        <Skeleton className="h-4 w-64 max-w-full bg-on-hero/15" />
      </div>
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-[72px] items-center gap-3.5 px-4 py-3 lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card"
          >
            <Skeleton className="size-11 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
