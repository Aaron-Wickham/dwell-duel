import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Below the Admin header and section tabs: pending approvals, then Create task beside the task
// catalog from lg (5 : 7).
export default function Loading() {
  return (
    <SkeletonScreen name="admin-tasks" className="flex flex-col gap-5 md:gap-7">
      <SkeletonCard className="gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 py-4">
              <div className="flex items-start gap-2">
                <Skeleton className="size-[22px] shrink-0 rounded-md" />
                <div className="flex grow flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-11 w-28" />
                <Skeleton className="h-11 w-24" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7">
        <SkeletonCard className="gap-4">
          <Skeleton className="h-6 w-32" />
          <SkeletonField />
          <SkeletonField tall />
          <SkeletonField />
          <Skeleton className="h-12 w-full md:w-36" />
        </SkeletonCard>
        <SkeletonCard className="gap-1">
          <Skeleton className="h-6 w-32" />
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-3/5" />
                  <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-11 w-20" />
                  <Skeleton className="h-11 w-28" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
