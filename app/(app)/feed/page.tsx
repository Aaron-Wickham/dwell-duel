import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listFeed } from '@/lib/social/list-feed'
import { readPageParams, showMoreHref, newestHref } from '@/lib/pagination/cursor'
import { Page, PageHeader } from '@/components/ui/page'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { FeedList } from './feed-list'

export default async function FeedPage(props: PageProps<'/feed'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const feed = await listFeed(supabase, { page: readPageParams(searchParams, 'before') })

  return (
    <Page transition="tab">
      <PageHeader title="Feed" description="Everything that’s happened in DwellDuel, newest first." />
      <LiveTables subscriptions={pageSubscriptions.feed()} />
      <FeedList
        events={feed.rows}
        heading="Events"
        headingId="feed-events"
        headingHidden
        aboveList={
          feed.windowed && (
            <div className="px-[18px] pt-3 md:px-6">
              <BackToNewest href={newestHref('/feed', searchParams, 'before')} />
            </div>
          )
        }
        belowList={
          feed.next && (
            <div className="px-[18px] pb-3 md:px-6">
              <ShowMore href={showMoreHref('/feed', searchParams, 'before', feed.next)} fresh={feed.next.kind === 'window'} />
            </div>
          )
        }
      />
    </Page>
  )
}
