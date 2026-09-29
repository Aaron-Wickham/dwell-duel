import { cardClass } from '@/components/ui/card'
import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: one card of member rows, each an adjust-balance form
// that lays out in a row from md.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-members" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 py-4 md:flex-row md:items-end md:gap-4">
            <div className="flex items-center gap-3 md:w-60 md:shrink-0 md:self-center">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="flex min-w-0 grow items-end gap-2">
              <SkeletonField className="w-[108px] shrink-0 md:w-[150px]" />
              <SkeletonField className="grow" />
            </div>
            <Skeleton className="h-12 w-full md:w-28" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
