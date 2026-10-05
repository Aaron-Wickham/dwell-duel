import { pageClass } from '@/components/ui/page'
import { dividedRowClass, dividedRowsClass } from '@/components/ui/list-card'
import { cn } from '@/lib/utils'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

function Group({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Skeleton className="h-6 w-40" />
      <div className={dividedRowsClass}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={cn(dividedRowClass, 'flex items-center justify-between gap-3')}>
            <div className="flex grow flex-col gap-2">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
            <Skeleton className="h-11 w-28 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Mirrors Tasks: header with its description, then To do as divided rows on the page (D2), full
// width. The side column for what's waiting, turned down and done shows only when it has rows, so
// it's left out, and To do lands where it was drawn (#386, #394).
export default function Loading() {
  return (
    <SkeletonScreen name="tasks" className={pageClass}>
      <SkeletonPageHeader description />
      <Group rows={4} />
    </SkeletonScreen>
  )
}
