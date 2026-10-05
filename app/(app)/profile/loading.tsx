import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Edit profile: back link, header, and its one card of photo, name, bio and Save.
export default function Loading() {
  return (
    <SkeletonScreen name="profile" className={pageClassFor('reading')}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-28" />
      </div>
      <SkeletonPageHeader />
      <SkeletonCard className="gap-5">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-14" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full md:size-20" />
            <Skeleton className="h-11 w-32" />
          </div>
        </div>
        <SkeletonField />
        <SkeletonField tall />
        <Skeleton className="h-12 w-full md:w-40" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
