import { Fragment } from 'react'
import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the full rules: back link, header, intro and a stack of section cards, with the contents
// beside them at lg, and below lg the collapsed contents after the first card.
export default function Loading() {
  return (
    <SkeletonScreen name="how-it-works-rules" className={pageClassFor('reading')}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-16" />
      </div>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
        <div className="hidden lg:flex lg:flex-col lg:gap-4">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-36" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-5 md:gap-7">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          {[0, 1, 2].map((i) => (
            <Fragment key={i}>
              <SkeletonCard className="gap-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/5" />
              </SkeletonCard>
              {i === 0 && <Skeleton className="h-12 w-full rounded-card lg:hidden" />}
            </Fragment>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
