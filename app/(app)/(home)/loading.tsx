import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Home: greeting, balance hero, and the tile list (a grid from lg).
export default function Loading() {
  return (
    <SkeletonScreen name="home" className={pageClass}>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-4 rounded-[22px] bg-hero p-[18px] md:p-7 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-end justify-between gap-3 lg:shrink-0 lg:flex-col lg:items-start lg:gap-2.5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24 bg-on-hero/15" />
            <Skeleton className="h-10 w-40 bg-on-hero/15 md:h-14 md:w-56" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full bg-hero-inset" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grow">
          <Skeleton className="h-[62px] rounded-[14px] bg-hero-inset md:h-[72px]" />
          <Skeleton className="h-[62px] rounded-[14px] bg-hero-inset md:h-[72px]" />
        </div>
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
