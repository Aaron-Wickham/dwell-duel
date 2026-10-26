import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'
import { dividedRowsClass } from '@/components/ui/list-card'

// Below the Admin header and section tabs: pending approvals (the bulk bar, one line below lg until
// something is ticked, then a row per submission: on a phone the member and when, the task, then
// what's attached beside Approve and Reject, #418). Create task and the catalog are left out: a
// reviewer never gets them, and for an admin they stream in below (ADM-3).
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
    </SkeletonScreen>
  )
}
