import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'
import { dividedRowClass, dividedRowsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: a card of markets waiting to be resolved, as divided rows
// (D2), then the categories card.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-markets">
      <div className="flex flex-col gap-5 md:gap-7">
        <SkeletonCard className="gap-3">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className={dividedRowsClass}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className={cn(dividedRowClass, 'flex flex-col gap-3')}>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-3/5" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
                <Skeleton className="h-11 w-24" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="gap-3">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-24 w-full" />
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
