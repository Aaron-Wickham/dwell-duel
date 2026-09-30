import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'

// Below the Admin header and section tabs: one card of markets waiting to be resolved.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-markets">
      <SkeletonCard className="gap-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 md:flex-row md:items-center md:gap-4">
              <div className="flex grow flex-col gap-2">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="h-11 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
