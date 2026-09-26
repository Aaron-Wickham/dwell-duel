import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the markets list: header with Create market, then one status group of market cards,
// three across from lg.
export default function Loading() {
  return (
    <SkeletonScreen name="markets" className={pageClass}>
      <SkeletonPageHeader action />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="md:p-[18px]">
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
