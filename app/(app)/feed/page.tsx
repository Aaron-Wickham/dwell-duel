import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listFeed } from '@/lib/social/list-feed'
import { FEED_SHOWS, FEED_SHOW_LABELS, feedShowHref, readFeedShow, type FeedShow } from '@/lib/social/feed-filter'
import { getReactions } from '@/lib/social/reactions'
import { readPageParams, showMoreHref, newestHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { NothingOlder } from '@/components/ui/nothing-older'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { IntentLink } from '@/components/ui/intent-link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'
import { FeedList } from './feed-list'

const ROW_ID_PREFIX = 'feed'

const EMPTY: Record<Exclude<FeedShow, 'all'>, { title: string; body: string }> = {
  results: { title: 'No results yet.', body: 'Resolved markets and winning bets show up here.' },
  mine: { title: 'Nothing of yours yet.', body: 'Your bets, your markets and results on markets you’re in show up here.' },
}

export default async function FeedPage(props: PageProps<'/feed'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const show = readFeedShow(searchParams.show)
  const feed = await listFeed(supabase, {
    show,
    page: readPageParams(searchParams, 'before'),
    alongside: (ids) => getReactions(supabase, ids),
  })
  const reactions = feed.alongside
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const backToNewestHref = newestHref('/feed', searchParams, 'before')

  return (
    // D1 (#385, #388): the feed is Home's Activity, and this is its See all, a drill-down from Home.
    <Page transition="drill-down" width="reading">
      <BackLink href="/">Home</BackLink>
      <PageHeader title="Activity" />
      <SubNav
        label="Show"
        items={FEED_SHOWS.map((s) => ({ href: feedShowHref(s), label: FEED_SHOW_LABELS[s], current: s === show }))}
      />
      <LiveTables subscriptions={pageSubscriptions.feed()} renderedAt={renderStamp()} />
      <ShowMoreFocus />
      <FeedList
        events={feed.rows}
        reactions={reactions}
        now={now}
        heading="Events"
        headingId="feed-events"
        headingHidden
        rowIdPrefix={ROW_ID_PREFIX}
        emptyState={
          feed.windowed ? (
            <NothingOlder href={backToNewestHref} />
          ) : show !== 'all' ? (
            <EmptyState
              title={EMPTY[show].title}
              action={
                show === 'mine' && (
                  <IntentLink
                    href="/markets"
                    transitionTypes={TAB_TRANSITION}
                    className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start no-underline')}
                  >
                    Browse markets
                  </IntentLink>
                )
              }
            >
              {EMPTY[show].body}
            </EmptyState>
          ) : undefined
        }
        aboveList={
          feed.windowed &&
          feed.rows.length > 0 && (
            <div className="pt-3">
              <BackToNewest href={backToNewestHref} />
            </div>
          )
        }
        belowList={
          feed.next && (
            <div className="pb-3">
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
