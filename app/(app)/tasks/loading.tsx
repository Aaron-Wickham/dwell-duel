import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Tasks: header with its description, then the catalog card of task rows.
export default function Loading() {
  return (
    <SkeletonScreen name="tasks" className={pageClass}>
      <SkeletonPageHeader description />
      <SkeletonCard className="gap-0 p-0 md:p-0">
        <div className="flex flex-col divide-y divide-line px-[18px] md:px-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 py-[18px] md:flex-row md:items-center md:gap-5 md:py-[22px]">
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="h-11 w-32 shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
