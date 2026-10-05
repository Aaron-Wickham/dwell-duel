import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'

export default function Loading() {
  return (
    <SkeletonScreen name="feed" className={pageClassFor('reading')}>
      <Skeleton className="h-11 w-24" />
      <SkeletonPageHeader />
      <Skeleton className="h-[52px] w-full rounded-tile md:w-72" />
      <FeedListSkeleton headingHidden reactions />
    </SkeletonScreen>
  )
}
