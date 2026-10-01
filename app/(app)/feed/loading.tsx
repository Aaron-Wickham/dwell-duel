import { pageClassFor } from '@/components/ui/page'
import { Skeleton, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'

export default function Loading() {
  return (
    <SkeletonScreen name="feed" className={pageClassFor('reading')}>
      <SkeletonPageHeader description />
      <Skeleton className="h-[52px] w-full rounded-[14px] md:w-72" />
      <FeedListSkeleton headingHidden reactions />
    </SkeletonScreen>
  )
}
