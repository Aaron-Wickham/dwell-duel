import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { dividedRowClass, dividedRowsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: pending approvals (the bulk bar, then a row per
// submission: checkbox, member, task and attachments, Approve), then Create task beside the task
// catalog from lg (5 : 7), divided rows inside its card (D2).
export default function Loading() {
  return (
    <SkeletonScreen name="admin-tasks" className="flex flex-col gap-5 md:gap-7">
      <SkeletonCard className="gap-4">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-tile border border-line px-3.5 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-h-11 items-center gap-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-11 grow lg:w-36" />
              <Skeleton className="h-11 grow lg:w-36" />
            </div>
          </div>
          <div className={dividedRowsClass}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-start gap-2 py-3">
                <div className="flex size-11 shrink-0 items-center">
                  <Skeleton className="size-[22px] rounded-segment" />
                </div>
                <div className="flex grow flex-col gap-2 pt-2.5 lg:flex-row lg:items-center lg:gap-6 lg:pt-0">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-3/5 lg:w-48" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-11 w-24 shrink-0" />
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
