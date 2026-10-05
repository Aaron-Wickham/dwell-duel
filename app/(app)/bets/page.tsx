import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listMyCancelledBets } from '@/lib/bets/list-my-bets'
import { listMyWagers } from '@/lib/bets/list-my-wagers'
import { listMyTransactions } from '@/lib/ledger/my-transactions'
import { newestHref, readPageParams, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetPage } from '@/lib/pagination/keyset'
import { rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { Page, PageHeader } from '@/components/ui/page'
import { ListSection } from '@/components/ui/list-section'
import { buttonVariants } from '@/components/ui/button'
import { IntentLink } from '@/components/ui/intent-link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { CancelledBetRows, WagerRows } from './bet-rows'
import { CoinRows } from './coin-rows'

const PATH = '/bets'

type Tab = 'open' | 'settled' | 'cancelled' | 'coins'

type Empty = { title: string; body: string; action?: { href: string; label: string } }

const TABS: Record<Tab, { label: string; empty: Empty }> = {
  open: {
    label: 'Open',
    empty: {
      title: 'No open bets.',
      body: 'Solo bets and parlays waiting on a result show up here.',
      action: { href: '/markets', label: 'Browse markets' },
    },
  },
  settled: {
    label: 'Settled',
    empty: {
      title: 'Nothing settled yet.',
      body: 'Solo bets and parlays show up here once their markets resolve or are called off.',
    },
  },
  cancelled: {
    label: 'Cancelled',
    empty: { title: 'No cancelled bets.', body: 'Bets are final. Bets cancelled before October 2026, when that was allowed, show up here.' },
  },
  coins: {
    label: 'Coins',
    empty: {
      title: 'No coin movements yet.',
      body: 'Every coin you gain or spend shows up here: bets, winnings, refunds and task rewards.',
      action: { href: '/tasks', label: 'See tasks' },
    },
  },
}

function readTab(value: SearchParams[string]): Tab {
  return value === 'settled' || value === 'cancelled' || value === 'coins' ? value : 'open'
}

function TabSection<Row>({
  tab,
  page,
  searchParams,
  children,
}: {
  tab: Tab
  page: KeysetPage<Row>
  searchParams: SearchParams
  children: ReactNode
}) {
  const { label, empty } = TABS[tab]
  const backToNewestHref = newestHref(PATH, searchParams, tab)
  // Coins is a divided list, so Show more takes a hairline; the bet tabs are list cards, spaced on
  // their own. Either way the list sits on the page (D2): the tabs already name it, so its heading
  // is for a screen reader only.
  const divided = tab === 'coins'
  return (
    <ListSection title={label} titleId={`${tab}-bets-title`} titleHidden>
      {page.windowed && page.rows.length > 0 && (
        <div className="flex flex-col">
          <BackToNewest href={backToNewestHref} />
        </div>
      )}
      {page.rows.length > 0 ? (
        children
      ) : page.windowed ? (
        <NothingOlder href={backToNewestHref} />
      ) : (
        <EmptyState
          title={empty.title}
          action={
            empty.action && (
              <IntentLink
                href={empty.action.href}
                transitionTypes={TAB_TRANSITION}
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start no-underline')}
              >
                {empty.action.label}
              </IntentLink>
            )
          }
        >
          {empty.body}
        </EmptyState>
      )}
      {page.next && (
        <div className={cn('flex flex-col', divided && 'border-t border-line pt-3')}>
          <ShowMore
            href={showMoreHref(PATH, searchParams, tab, page.next)}
            fresh={page.next.kind === 'window'}
            focusId={rowDomId(tab, page.next.firstId)}
          />
        </div>
      )}
    </ListSection>
  )
}

// Each tab pages on its own param, named after the tab, and a tab link carries no cursor, so
// switching tabs always starts from the newest.
export default async function MyBetsPage(props: PageProps<'/bets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const tab = readTab(searchParams.tab)
  const pageParams = readPageParams(searchParams, tab)

  let section: ReactNode
  if (tab === 'coins') {
    const page = await listMyTransactions(supabase, user.id, pageParams)
    section = (
      <TabSection tab={tab} page={page} searchParams={searchParams}>
        <CoinRows entries={page.rows} rowIdPrefix={tab} now={new Date()} />
      </TabSection>
    )
  } else if (tab === 'cancelled') {
    const page = await listMyCancelledBets(supabase, user.id, pageParams)
    section = (
      <TabSection tab={tab} page={page} searchParams={searchParams}>
        <CancelledBetRows bets={page.rows} rowIdPrefix={tab} />
      </TabSection>
    )
  } else {
    const page = await listMyWagers(supabase, user.id, tab, pageParams)
    section = (
      <TabSection tab={tab} page={page} searchParams={searchParams}>
        <WagerRows wagers={page.rows} rowIdPrefix={tab} />
      </TabSection>
    )
  }

  return (
    // Coins is one stream of rows, so it reads at the reading width; the bet tabs' cards take the
    // wide column. The header and tabs move with it, keeping one pair of edges.
    <Page transition="tab" width={tab === 'coins' ? 'reading' : 'wide'}>
      <PageHeader title="My bets" />
      <LiveTables subscriptions={tab === 'coins' ? pageSubscriptions.myCoins(user.id) : pageSubscriptions.myBets(user.id)} renderedAt={renderStamp()} />
      <ShowMoreFocus />
      <SubNav
        label="My bets sections"
        items={(Object.keys(TABS) as Tab[]).map((t) => ({
          href: t === 'open' ? PATH : `${PATH}?tab=${t}`,
          label: TABS[t].label,
          current: t === tab,
        }))}
      />
      {tab === 'coins' && <p className="text-sm text-ink2">Only you can see your coin history.</p>}
      {section}
    </Page>
  )
}
