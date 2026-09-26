import { Skeleton, SkeletonCard, SkeletonScreen } from '@/components/ui/skeleton'

// Below the Admin header and section tabs (admin/layout.tsx): the invite form beside the invite
// list from lg (5 : 7).
export default function Loading() {
  return (
    <SkeletonScreen
      name="admin-invites"
      className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-7"
    >
      <SkeletonCard>
        <Skeleton className="h-6 w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-12 grow" />
            <Skeleton className="h-12 w-20 shrink-0" />
          </div>
          <Skeleton className="h-4 w-4/5" />
        </div>
      </SkeletonCard>
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-16 items-center justify-between gap-3 py-2.5">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-11 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
