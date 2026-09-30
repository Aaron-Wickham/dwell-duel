import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listFeed } from '@/lib/social/list-feed'
import { getReactions } from '@/lib/social/reactions'
import { readPageParams, showMoreHref, newestHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { NothingOlder } from '@/components/ui/nothing-older'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { FeedList } from './feed-list'

const ROW_ID_PREFIX = 'feed'

export default async function FeedPage(props: PageProps<'/feed'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const feed = await listFeed(supabase, { page: readPageParams(searchParams, 'before') })
  const reactions = await getReactions(supabase, feed.rows.map((e) => e.id))
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const backToNewestHref = newestHref('/feed', searchParams, 'before')

  return (
    <Page transition="tab" width="reading">
      <PageHeader title="Feed" description="Everything that’s happened in DwellDuel, newest first." />
      <LiveTables subscriptions={pageSubscriptions.feed()} />
      <ShowMoreFocus />
      <FeedList
        events={feed.rows}
        reactions={reactions}
        now={now}
        heading="Events"
        headingId="feed-events"
        headingHidden
        rowIdPrefix={ROW_ID_PREFIX}
        emptyState={feed.windowed ? <NothingOlder href={backToNewestHref} /> : undefined}
        aboveList={
          feed.windowed &&
          feed.rows.length > 0 && (
            <div className="px-[18px] pt-3 md:px-6">
              <BackToNewest href={backToNewestHref} />
            </div>
          )
        }
        belowList={
          feed.next && (
            <div className="px-[18px] pb-3 md:px-6">
              <ShowMore
                href={showMoreHref('/feed', searchParams, 'before', feed.next)}
                fresh={feed.next.kind === 'window'}
                focusId={rowDomId(ROW_ID_PREFIX, feed.next.firstId)}
              />
            </div>
          )
        }
      />
    </Page>
  )
}
