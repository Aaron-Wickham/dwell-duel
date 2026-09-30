import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Edit profile: back link, header, and the form card's photo, name and bio (at lg, the
// photo and its preview in a column beside the fields).
export default function Loading() {
  return (
    <SkeletonScreen name="profile" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-28" />
      </div>
      <SkeletonPageHeader description />
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex flex-col gap-5 max-lg:hidden">
          <SkeletonCard className="gap-5">
            <Skeleton className="h-5 w-16" />
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="h-11 w-32" />
            </div>
          </SkeletonCard>
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-5 w-72 max-w-full" />
            <div className="flex items-center gap-5">
              <Skeleton className="size-20 shrink-0 rounded-full" />
              <Skeleton className="h-11 w-56 max-w-full" />
            </div>
          </SkeletonCard>
        </div>
        <SkeletonCard className="gap-5">
          <div className="flex items-center gap-4 lg:hidden">
            <Skeleton className="size-16 rounded-full md:size-20" />
            <Skeleton className="h-11 w-32" />
          </div>
          <SkeletonField />
          <SkeletonField tall />
          <Skeleton className="h-12 w-full md:w-40" />
        </SkeletonCard>
      </div>
    </SkeletonScreen>
  )
}
