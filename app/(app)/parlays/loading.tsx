import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Parlays: the slip card beside My parlays from lg (5 : 7).
export default function Loading() {
  return (
    <SkeletonScreen name="parlays" className={pageClass}>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <SkeletonCard>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-4">
                <div className="flex grow flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
                <Skeleton className="h-11 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="gap-1">
          <Skeleton className="h-6 w-32" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3 py-4">
                <Skeleton className="h-4 w-4/5" />
                {Array.from({ length: 2 }, (_, j) => (
                  <div key={j} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
