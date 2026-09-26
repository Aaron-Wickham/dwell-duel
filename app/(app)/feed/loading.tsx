import { pageClass } from '@/components/ui/page'
import { SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'

export default function Loading() {
  return (
    <SkeletonScreen name="feed" className={pageClass}>
      <SkeletonPageHeader description />
      <FeedListSkeleton headingHidden />
    </SkeletonScreen>
  )
}
