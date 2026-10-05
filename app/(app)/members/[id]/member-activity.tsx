import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { getReactions } from '@/lib/social/reactions'
import { newestHref, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { ContentReveal } from '@/components/nav/page-transition'
import { NothingOlder } from '@/components/ui/nothing-older'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { FeedList } from '@/app/(app)/feed/feed-list'

export const ROW_ID_PREFIX = 'activity'

// Exported so the page-level paging tests (windowed-empty, focusId) can render this section
// directly: it's an async Server Component inside a <Suspense>, which jsdom can't render in place.
export async function MemberActivity({
  memberId,
  page,
  searchParams,
}: {
  memberId: string
  page: PageParams
  searchParams: SearchParams
}) {
  const { supabase } = await requireUser()
  const activity = await listFeed(supabase, { actorId: memberId, page, alongside: (ids) => getReactions(supabase, ids) })
  const reactions = activity.alongside
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const pathname = `/members/${memberId}`
  const backToNewestHref = newestHref(pathname, searchParams, 'activity')

  return (
    <ContentReveal>
      <ShowMoreFocus />
      <FeedList
        events={activity.rows}
        reactions={reactions}
        now={now}
        heading="Recent activity"
        headingId="recent-activity"
        rowIdPrefix={ROW_ID_PREFIX}
        plainHref={pathname}
        emptyState={activity.windowed ? <NothingOlder href={backToNewestHref} /> : undefined}
        aboveList={activity.windowed && activity.rows.length > 0 && <BackToNewest href={backToNewestHref} />}
        belowList={
          activity.next && (
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'activity', activity.next)}
              fresh={activity.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, activity.next.firstId)}
            />
          )
        }
      />
    </ContentReveal>
  )
}
