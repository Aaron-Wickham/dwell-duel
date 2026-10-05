import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { dividedRowClass, dividedRowsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: pending approvals (the bulk bar, one line below lg until
// something is ticked, then a row per submission: on a phone the member and when, the task, then
// what's attached beside Approve and Reject, #418), then Create task beside the task catalog from lg
// (5 : 7), divided rows inside its card (D2).
export default function Loading() {
  return (
    <SkeletonScreen name="admin-tasks" className="flex flex-col gap-5 md:gap-7">
      <SkeletonCard className="gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col gap-3">
          {/* One line below lg, until something is ticked (#418). */}
          <div className="flex flex-col gap-2 rounded-tile border border-line px-3.5 py-0.5 lg:flex-row lg:items-center lg:justify-between lg:py-2">
            <div className="flex min-h-11 items-center justify-between gap-4 lg:justify-start">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-32 lg:h-5 lg:w-36" />
            </div>
            <div className="flex gap-2 max-lg:hidden">
              <Skeleton className="h-11 w-36" />
              <Skeleton className="h-11 w-36" />
            </div>
          </div>
          <div className={dividedRowsClass}>
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="grid grid-cols-[44px_minmax(0,1fr)_auto] gap-x-2 py-1 lg:flex lg:items-center lg:gap-2 lg:py-3"
              >
                <div className="row-span-2 flex size-11 items-center">
                  <Skeleton className="size-[22px] rounded-segment" />
                </div>
                <div className="flex h-6 items-center lg:h-auto lg:w-32">
                  <Skeleton className="h-5 w-24" />
                </div>
                <div className="flex h-6 items-center justify-end lg:order-last lg:hidden">
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="col-span-2 flex h-5 items-center lg:h-auto lg:grow">
                  <Skeleton className="h-4 w-3/5 lg:h-5 lg:w-48" />
                </div>
                <div className="col-span-2 col-start-2 flex min-h-11 items-center justify-between gap-2">
                  <Skeleton className="h-4 w-20" />
                  <div className="flex gap-1">
                    <Skeleton className="h-11 w-[88px]" />
                    <Skeleton className="h-11 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
        <SkeletonCard>
          <Skeleton className="h-6 w-32" />
          <div className={dividedRowsClass}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={cn(dividedRowClass, 'flex flex-col gap-2')}>
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
