import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Settings: back link, header, and the four section cards.
export default function Loading() {
  return (
    <SkeletonScreen name="settings" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-28" />
      </div>
      <SkeletonPageHeader description />
      <div className="flex max-w-[720px] flex-col gap-5 md:gap-7">
        <SkeletonCard className="gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-[52px] w-full rounded-[14px]" />
        </SkeletonCard>
        <SkeletonCard className="gap-3">
          <Skeleton className="h-6 w-20" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-5 w-32 grow" />
            <Skeleton className="h-11 w-36" />
          </div>
        </SkeletonCard>
        <SkeletonCard className="gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-11 w-48" />
          <Skeleton className="h-11 w-48" />
        </SkeletonCard>
        <SkeletonCard className="gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-12 w-full md:w-40" />
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
