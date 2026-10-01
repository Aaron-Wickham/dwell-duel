import { cardClass } from '@/components/ui/card'
import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: one card of member rows, each an adjust-balance form
// that lays out in a row from md; at lg, a grid of member cards with the form stacked again.
export default function Loading() {
  return (
    <SkeletonScreen
      name="admin-members"
      className={cn(cardClass, 'px-[18px] py-1 md:px-6 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none')}
    >
      <div className="flex flex-col divide-y divide-line lg:grid lg:grid-cols-3 lg:items-start lg:gap-5 lg:divide-y-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={cn(
              'flex flex-col gap-3 py-4 md:flex-row md:items-end md:gap-4 lg:flex-col lg:items-stretch lg:gap-3 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-6 lg:shadow-card',
              // A phone shows four rows, as before; lg fills two rows of three cards.
              i >= 4 && 'hidden lg:flex',
            )}
          >
            <div className="flex items-center gap-3 md:w-60 md:shrink-0 md:self-center lg:w-auto lg:self-auto">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="flex min-w-0 grow items-end gap-2">
              <SkeletonField className="w-[108px] shrink-0 md:w-[150px] lg:w-[108px]" />
              <SkeletonField className="grow" />
            </div>
            <Skeleton className="h-12 w-full md:w-28 lg:w-full" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}
