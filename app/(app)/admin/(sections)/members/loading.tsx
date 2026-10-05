import { Skeleton, SkeletonScreen } from '@/components/ui/skeleton'
import { listCardClass, listCardsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'

// Below the Admin header and section tabs: the search box and the Active/Removed tabs (side by
// side from lg), then the Members heading over member cards on the page (D2), three across at lg.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-members" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex gap-2 lg:max-w-[520px] lg:grow">
          <Skeleton className="h-12 grow" />
          <Skeleton className="h-12 w-24 shrink-0" />
        </div>
        <Skeleton className="h-[52px] w-full rounded-tile md:w-64" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-28" />
        <div className={cn(listCardsClass, 'lg:grid lg:grid-cols-3 lg:items-start lg:gap-5')}>
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={cn(
                listCardClass,
                'flex items-start gap-3',
                // A phone shows five cards; lg fills two rows of three.
                i >= 5 && 'hidden lg:flex',
              )}
            >
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
