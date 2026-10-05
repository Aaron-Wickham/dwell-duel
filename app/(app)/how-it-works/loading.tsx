import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors How it works' short version: back link, header, four short sections, the questions as
// divided rows, then the link to the full rules (which has its own skeleton, rules/loading.tsx).
export default function Loading() {
  return (
    <SkeletonScreen name="how-it-works" className={pageClassFor('reading')}>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-5 w-16" />
      </div>
      <SkeletonPageHeader />
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-col divide-y divide-line">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex min-h-[52px] items-center">
              <Skeleton className="h-5 w-64 max-w-full" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-5 w-36" />
    </SkeletonScreen>
  )
}
