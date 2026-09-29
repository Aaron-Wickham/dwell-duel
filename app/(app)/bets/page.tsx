import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Ban, CircleDot, Coins, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listMyCancelledBets } from '@/lib/bets/list-my-bets'
import { listMyWagers } from '@/lib/bets/list-my-wagers'
import { listMyTransactions } from '@/lib/ledger/my-transactions'
import { newestHref, readPageParams, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetPage } from '@/lib/pagination/keyset'
import { rowDomId } from '@/lib/pagination/row-id'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { CancelledBetRows, WagerRows } from './bet-rows'
import { CoinRows } from './coin-rows'

const PATH = '/bets'

type Tab = 'open' | 'settled' | 'cancelled' | 'coins'

const TABS: Record<Tab, { label: string; empty: { icon: LucideIcon; title: string; body: string } }> = {
  open: {
    label: 'Open',
    empty: { icon: CircleDot, title: 'No open bets.', body: 'Solo bets and parlays waiting on a result show up here.' },
  },
  settled: {
    label: 'Settled',
    empty: {
      icon: History,
      title: 'Nothing settled yet.',
      body: 'Solo bets and parlays show up here once their markets resolve or are voided.',
    },
  },
  cancelled: {
    label: 'Cancelled',
    empty: { icon: Ban, title: 'No cancelled bets.', body: 'Bets you cancel before a market closes show up here.' },
  },
  coins: {
    label: 'Coins',
    empty: {
      icon: Coins,
      title: 'No coin movements yet.',
      body: 'Every coin you gain or spend shows up here: bets, winnings, refunds and task rewards.',
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
  return (
    <SectionCard
      title={label}
      titleId={`${tab}-bets-title`}
      className={page.rows.length > 0 ? 'gap-1' : undefined}
    >
      {page.windowed && page.rows.length > 0 && (
        <div className="flex flex-col py-2">
          <BackToNewest href={backToNewestHref} />
        </div>
      )}
      {page.rows.length > 0 ? (
        children
      ) : page.windowed ? (
        <NothingOlder href={backToNewestHref} />
      ) : (
        <EmptyState icon={empty.icon} title={empty.title}>
          {empty.body}
        </EmptyState>
      )}
      {page.next && (
        <div className="flex flex-col border-t border-line pt-3">
          <ShowMore
            href={showMoreHref(PATH, searchParams, tab, page.next)}
            fresh={page.next.kind === 'window'}
            focusId={rowDomId(tab, page.next.firstId)}
          />
        </div>
      )}
    </SectionCard>
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
        <CoinRows entries={page.rows} rowIdPrefix={tab} />
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
    <Page transition="tab">
      <PageHeader
        title="My bets"
        description="Your solo bets, parlays and coin history. Only you can see this page."
      />
      <LiveTables subscriptions={tab === 'coins' ? pageSubscriptions.myCoins(user.id) : pageSubscriptions.myBets(user.id)} />
      <ShowMoreFocus />
      <SubNav
        label="My bets sections"
        items={(Object.keys(TABS) as Tab[]).map((t) => ({
          href: t === 'open' ? PATH : `${PATH}?tab=${t}`,
          label: TABS[t].label,
          current: t === tab,
        }))}
      />
      {section}
    </Page>
  )
}
