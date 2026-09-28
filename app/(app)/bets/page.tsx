import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Ban, CircleDot, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listMyBets, listMyCancelledBets } from '@/lib/bets/list-my-bets'
import { newestHref, readPageParams, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetPage } from '@/lib/pagination/keyset'
import { rowDomId } from '@/lib/pagination/row-id'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { CancelledBetRows, MyBetRows } from './bet-rows'

const PATH = '/bets'

function BetSection<Row>({
  param,
  title,
  page,
  searchParams,
  empty,
  children,
}: {
  param: 'open' | 'settled' | 'cancelled'
  title: string
  page: KeysetPage<Row>
  searchParams: SearchParams
  empty: { icon: LucideIcon; title: string; body: string }
  children: ReactNode
}) {
  const backToNewestHref = newestHref(PATH, searchParams, param)
  return (
    <SectionCard title={title} titleId={`${param}-bets-title`} className={page.rows.length > 0 ? 'gap-1' : undefined}>
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
            href={showMoreHref(PATH, searchParams, param, page.next)}
            fresh={page.next.kind === 'window'}
            focusId={rowDomId(param, page.next.firstId)}
            description={title}
          />
        </div>
      )}
    </SectionCard>
  )
}

export default async function MyBetsPage(props: PageProps<'/bets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [open, settled, cancelled] = await Promise.all([
    listMyBets(supabase, user.id, 'open', readPageParams(searchParams, 'open')),
    listMyBets(supabase, user.id, 'settled', readPageParams(searchParams, 'settled')),
    listMyCancelledBets(supabase, user.id, readPageParams(searchParams, 'cancelled')),
  ])

  return (
    <Page transition="tab">
      <PageHeader title="My bets" description="Only you can see this page. Parlays are on the Parlays page." />
      <LiveTables subscriptions={pageSubscriptions.myBets(user.id)} />
      <ShowMoreFocus />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-2 lg:items-start">
        <BetSection
          param="open"
          title="Open"
          page={open}
          searchParams={searchParams}
          empty={{ icon: CircleDot, title: 'No open bets.', body: 'Bets on markets that haven’t resolved show up here.' }}
        >
          <MyBetRows bets={open.rows} rowIdPrefix="open" />
        </BetSection>
        <div className="flex flex-col gap-5 md:gap-7">
          <BetSection
            param="settled"
            title="Settled"
            page={settled}
            searchParams={searchParams}
            empty={{ icon: History, title: 'Nothing settled yet.', body: 'Bets on resolved and voided markets show up here.' }}
          >
            <MyBetRows bets={settled.rows} rowIdPrefix="settled" />
          </BetSection>
          <BetSection
            param="cancelled"
            title="Cancelled"
            page={cancelled}
            searchParams={searchParams}
            empty={{ icon: Ban, title: 'No cancelled bets.', body: 'Bets you cancel before a market closes show up here.' }}
          >
            <CancelledBetRows bets={cancelled.rows} rowIdPrefix="cancelled" />
          </BetSection>
        </div>
      </div>
    </Page>
  )
}
