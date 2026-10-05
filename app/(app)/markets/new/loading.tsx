import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonField, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors Create market: back link, header, and the form card with a Yes/No market's fields, with
// the card's preview beside it at lg.
export default function Loading() {
  return (
    <SkeletonScreen name="create-market" className={pageClass}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-24" />
      </div>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <SkeletonCard className="gap-5">
          <SkeletonField />
          <SkeletonField tall />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-[52px] rounded-tile" />
          </div>
          <SkeletonField />
          <Skeleton className="h-12 w-full md:w-44" />
        </SkeletonCard>
        <div className="hidden lg:flex lg:flex-col lg:gap-3">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-56" />
          <SkeletonCard className="gap-3">
            <Skeleton className="h-6 w-48 rounded-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </SkeletonCard>
        </div>
      </div>
    </SkeletonScreen>
  )
}
