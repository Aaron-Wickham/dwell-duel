import { Skeleton, SkeletonScreen } from '@/components/ui/skeleton'

// Below the Admin header and section tabs: the search box and the Active/Removed tabs (side by
// side from lg), then the Members heading over the table on the page (D2): a header row of sort links
// (#418), then from lg a row per member across five columns; on a phone, divided rows of name, email
// and one line.
export default function Loading() {
  return (
    <SkeletonScreen name="admin-members" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex gap-2 lg:max-w-[520px] lg:grow">
          <Skeleton className="h-12 grow" />
          <Skeleton className="h-12 w-24 shrink-0" />
        </div>
        <Skeleton className="h-[52px] w-full rounded-tile md:w-64" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-col divide-y divide-line">
          <div className="flex h-11 items-center gap-4 lg:gap-6">
            {['w-16', 'w-12', 'w-16', 'w-20', 'w-14'].map((width, i) => (
              <Skeleton key={i} className={`h-3.5 ${width} ${i === 0 ? 'lg:grow-[3]' : ''} ${i === 1 ? 'max-lg:hidden' : ''}`} />
            ))}
          </div>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5 py-3.5 lg:flex-row lg:items-start lg:gap-6 lg:py-3">
              <div className="flex flex-col gap-1.5 lg:grow-[3]">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-44" />
              </div>
              <Skeleton className="h-4 w-64 max-w-full lg:w-56" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
