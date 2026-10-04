import { pageClass } from '@/components/ui/page'
import { listCardClass, listCardsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Tasks: header with its description, then the catalog card of task cards, two across at lg.
export default function Loading() {
  return (
    <SkeletonScreen name="tasks" className={pageClass}>
      <SkeletonPageHeader description />
      <SkeletonCard>
        <div className={cn(listCardsClass, 'lg:grid lg:grid-cols-2 lg:gap-5')}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cn(listCardClass, 'flex flex-col gap-3 md:flex-row md:items-center md:gap-5')}>
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
