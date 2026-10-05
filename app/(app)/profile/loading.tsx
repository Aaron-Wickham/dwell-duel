import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// A field's label, in a box as tall as the real one.
function Label({ width }: { width: string }) {
  return (
    <div className="flex h-[23px] items-center">
      <Skeleton className={`h-4 ${width}`} />
    </div>
  )
}

// Mirrors Edit profile at its real height (#397): back link, header, and its one card of photo
// (with the line under it, shown while there's no photo, as for most members), name, bio with its
// hint (two lines on a phone) and Save.
export default function Loading() {
  return (
    <SkeletonScreen name="profile" className={pageClassFor('reading')}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-28" />
      </div>
      <SkeletonPageHeader />
      <SkeletonCard className="gap-5">
        <div className="flex flex-col">
          <div className="mb-1.5">
            <Label width="w-12" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-full md:size-20" />
              <Skeleton className="h-11 w-32" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label width="w-28" />
          <Skeleton className="h-12" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label width="w-10" />
          <div className="flex flex-col">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-full max-w-[400px]" />
            </div>
            <div className="flex h-5 items-center md:hidden">
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-[100px]" />
        </div>
        <Skeleton className="h-12 w-full md:w-40" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
