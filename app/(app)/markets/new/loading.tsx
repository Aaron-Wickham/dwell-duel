import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Create market: back link, header, and the form card with a Yes/No market's fields.
export default function Loading() {
  return (
    <SkeletonScreen name="create-market" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-24" />
      </div>
      <SkeletonPageHeader />
      <SkeletonCard className="max-w-[720px] gap-5">
        <SkeletonField />
        <SkeletonField tall />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-[52px] rounded-[14px]" />
        </div>
        <SkeletonField />
        <Skeleton className="h-12 w-full md:w-44" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}
