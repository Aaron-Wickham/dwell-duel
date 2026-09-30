import { redirect } from 'next/navigation'
import { CalendarDays, Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getLeaderboardPage, getYourStanding, type Board } from '@/lib/social/leaderboard'
import { currentSeasonName } from '@/lib/social/season'
import { newestHref, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { readRankPageParams } from '@/lib/pagination/rank-cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'
import { Awards } from '@/components/leaderboard/awards'
import { PastChampions } from '@/components/leaderboard/past-champions'
import { Podium } from '@/components/leaderboard/podium'
import { YourStandingCard } from '@/components/leaderboard/your-standing'
import { RaceChart } from '@/components/leaderboard/race-chart-lazy'
import { cn } from '@/lib/utils'
import { getAwards, getPastChampions, getRace, getRecords } from '@/lib/social/leaderboard-extras'

const PATH = '/leaderboard'
const ROW_ID_PREFIX = 'member'

const TABS: Record<Board, { label: string; href: string }> = {
  all: { label: 'Net worth', href: PATH },
  month: { label: 'This month', href: `${PATH}?tab=month` },
}

function readBoard(value: SearchParams[string]): Board {
  return value === 'month' ? 'month' : 'all'
}

function description(board: Board): string {
  if (board === 'all') return 'Ranked by net worth: balance plus DC riding on open bets. Ties share a rank.'
  return `Ranked by net betting profit in ${currentSeasonName()}: winnings and refunds minus stakes. Ties share a rank.`
}

// Both tabs page on `before`: a tab link carries no cursor, so switching always starts at the top.
export default async function LeaderboardPage(props: PageProps<'/leaderboard'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = readBoard(searchParams.tab)
  const page = await getLeaderboardPage(supabase, board, readRankPageParams(searchParams, 'before'))
  // The month's extras show only above the top of the board, never inside a window part-way down it.
  const showMonthExtras = board === 'month' && !page.windowed && page.rows.length > 0
  // On a wide screen the net-worth board fills its side column with your own standing; it needs
  // rankings beside it, so it's read only when there are rows below the podium.
  const showStanding = board === 'all' && page.rows.length > 1 && (page.windowed || page.rows.length > 3)
  const [records, race, awards, champions, standing, myRecords] = await Promise.all([
    getRecords(
      supabase,
      page.rows.map((r) => r.id),
    ),
    showMonthExtras ? getRace(supabase) : [],
    showMonthExtras ? getAwards(supabase) : [],
    board === 'month' ? getPastChampions(supabase) : [],
    showStanding ? getYourStanding(supabase, user.id) : null,
    showStanding ? getRecords(supabase, [user.id]) : new Map(),
  ])
  const podium = !page.windowed && page.rows.length >= 3 ? page.rows.slice(0, 3) : null
  const listed = podium ? page.rows.slice(3) : page.rows
  const backToNewestHref = newestHref(PATH, searchParams, 'before')

  let body
  if (page.windowed && page.rows.length === 0) {
    body = <NothingOlder href={backToNewestHref} />
  } else if (board === 'all' && !page.windowed && page.rows.length <= 1) {
    body = (
      <EmptyState icon={Trophy} title="No other members yet.">
        Invite friends to start the competition.
      </EmptyState>
    )
  } else if (board === 'month' && page.rows.length === 0) {
    body = (
      <EmptyState icon={CalendarDays} title="No bets this month yet.">
        Place a bet to get on this month’s board.
      </EmptyState>
    )
  } else {
    // The race always shows on the month's board, saying so when no bet has settled yet.
    const hasSide = showMonthExtras
    const hasChampions = board === 'month' && !page.windowed && champions.length > 0
    // At lg the month's extras move into a side column beside the rankings; on a phone they keep
    // their order around it, which is why the race and awards sit in a wrapper that is only a box at lg.
    const split = listed.length > 0 && (hasSide || hasChampions || showStanding)
    const rankings = listed.length > 0 && (
      <SectionCard
        title={<span className="sr-only">{board === 'all' ? 'Net worth rankings' : 'This month’s rankings'}</span>}
        titleId="leaderboard-rankings"
        className={cn('gap-0 py-1.5 px-2 md:py-1.5 md:px-3', split && 'lg:col-start-1 lg:row-span-2 lg:row-start-1')}
      >
        {page.windowed && (
          <div className="flex flex-col px-2.5 py-2.5 md:px-3.5">
            <BackToNewest href={backToNewestHref} />
          </div>
        )}
        <ol className="flex flex-col">
          {listed.map((member) => (
            <LeaderboardRow
              key={member.id}
              rank={member.rank}
              name={member.displayName}
              avatarSrc={member.avatarSrc}
              score={member.score}
              signed={board === 'month'}
              record={records.get(member.id)}
              isMe={member.id === user.id}
              href={`/members/${member.id}`}
              domId={rowDomId(ROW_ID_PREFIX, member.id)}
            />
          ))}
        </ol>
        {page.next && (
          <div className="flex flex-col px-2.5 py-2.5 md:px-3.5">
            <ShowMore
              href={showMoreHref(PATH, searchParams, 'before', page.next)}
              fresh={page.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, page.next.firstId)}
            />
          </div>
        )}
      </SectionCard>
    )
    body = (
      <>
        {podium && (
          <Podium
            members={podium.map((m) => ({ id: m.id, name: m.displayName, avatarSrc: m.avatarSrc, score: m.score, rank: m.rank }))}
            signed={board === 'month'}
            meId={user.id}
          />
        )}
        <div
          className={cn(
            'flex flex-col gap-5 md:gap-7',
            split && 'lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:items-start',
          )}
        >
          {hasSide && (
            <div className="contents lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:gap-7">
              <RaceChart series={race} />
              <Awards awards={awards} />
            </div>
          )}
          {rankings}
          {showStanding && listed.length > 0 && (
            <YourStandingCard standing={standing} record={myRecords.get(user.id)} className="hidden lg:col-start-2 lg:row-start-1 lg:flex" />
          )}
          {hasChampions && <PastChampions champions={champions} className="lg:col-start-2" />}
        </div>
      </>
    )
  }

  return (
    <Page transition="tab">
      <PageHeader title="Leaderboard" description={description(board)} />
      <LiveTables subscriptions={pageSubscriptions.leaderboard()} />
      <ShowMoreFocus />
      <SubNav
        label="Ranking"
        items={(Object.keys(TABS) as Board[]).map((b) => ({ href: TABS[b].href, label: TABS[b].label, current: b === board }))}
      />
      {body}
    </Page>
  )
}
