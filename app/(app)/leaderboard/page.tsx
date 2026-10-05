import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getJumpToMeTop, getLeaderboardPage, getYourStanding, type Board } from '@/lib/social/leaderboard'
import { currentSeasonName } from '@/lib/social/season'
import { newestHref, showMoreHref, type SearchParams } from '@/lib/pagination/cursor'
import { readRankPageParams } from '@/lib/pagination/rank-cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { ListSection } from '@/components/ui/list-section'
import { buttonVariants } from '@/components/ui/button'
import { IntentLink } from '@/components/ui/intent-link'
import { TAB_TRANSITION } from '@/components/nav/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { dividedRowsClass } from '@/components/ui/list-card'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { SubNav } from '@/components/ui/sub-nav'
import { JumpToMe } from '@/components/leaderboard/jump-to-me'
import { StandingCompact } from '@/components/leaderboard/standing-compact'
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

// A line under the rankings saying what the score is.
function note(board: Board): string {
  if (board === 'all') return 'Net worth is your balance plus DC riding on open bets.'
  return `Profit is winnings and refunds minus stakes on bets in ${currentSeasonName()}.`
}

// Both tabs page on `before`: a tab link carries no cursor, so switching always starts at the top.
export default async function LeaderboardPage(props: PageProps<'/leaderboard'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = readBoard(searchParams.tab)
  // `?at=me` opens a window with the member's own row near its top. It only applies to a fresh
  // visit: once a "Show more" has put a cursor in the URL, the cursor decides, so the link that
  // follows a window never throws the member back to their own place.
  const pageParams = readRankPageParams(searchParams, 'before')
  const jumping = searchParams.at === 'me' && pageParams.top === null && pageParams.bottom === null
  const page = await getLeaderboardPage(
    supabase,
    board,
    jumping ? { top: await getJumpToMeTop(supabase, board, user.id), bottom: null } : pageParams,
  )
  // The month's extras show only above the top of the board, never inside a window part-way down it.
  const showMonthExtras = board === 'month' && !page.windowed && page.rows.length > 0
  // Your standing: the phone's sticky bar and the side card at lg. It needs rankings to stand
  // beside, so it's read only when there are rows below the podium.
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
  // Only the net-worth board has a podium; This month leads with the race instead (#396).
  const podium = board === 'all' && !page.windowed && page.rows.length >= 3 ? page.rows.slice(0, 3) : null
  const listed = podium ? page.rows.slice(3) : page.rows
  const backToNewestHref = newestHref(PATH, { ...searchParams, at: undefined }, 'before')
  const meListed = page.rows.some((r) => r.id === user.id)
  const firstRank = page.rows[0]?.rank
  const lastRank = page.rows[page.rows.length - 1]?.rank

  let body
  if (page.windowed && page.rows.length === 0) {
    body = <NothingOlder href={backToNewestHref} />
  } else if (board === 'all' && !page.windowed && page.rows.length <= 1) {
    body = (
      <EmptyState title="No other members yet.">
        Invite friends to start the competition.
      </EmptyState>
    )
  } else if (board === 'month' && page.rows.length === 0) {
    body = (
      <EmptyState
        title="No bets this month yet."
        action={
          <IntentLink
            href="/markets"
            transitionTypes={TAB_TRANSITION}
            className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start no-underline')}
          >
            Browse markets
          </IntentLink>
        }
      >
        Place a bet to get on this month’s board.
      </EmptyState>
    )
  } else {
    const hasChampions = board === 'month' && !page.windowed && champions.length > 0
    const jump = !meListed && <JumpToMe href={`${PATH}?at=me`} focusId={rowDomId(ROW_ID_PREFIX, user.id)} />
    // The rankings sit on the page as divided rows (D2). Their heading would repeat the h1 and the
    // tab, so it's for a screen reader only.
    const rankings = listed.length > 0 && (
      <ListSection
        title={board === 'all' ? 'Net worth rankings' : 'This month’s rankings'}
        titleId="leaderboard-rankings"
        titleHidden
        className="gap-0 lg:col-start-1 lg:row-start-1"
      >
        {page.windowed && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink2">
              {firstRank === lastRank ? `Showing rank ${firstRank}` : `Showing ranks ${firstRank}–${lastRank}`}
            </p>
            <BackToNewest href={backToNewestHref} label="Back to the top" />
          </div>
        )}
        <ol className={dividedRowsClass}>
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
        {/* After the rows, so it sticks to the bottom only while they're on screen. */}
        {showStanding && standing && !meListed && <StandingCompact standing={standing} jump={jump} />}
        {page.next && (
          <div className="mt-3 flex flex-col">
            <ShowMore
              href={showMoreHref(PATH, searchParams, 'before', page.next)}
              fresh={page.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, page.next.firstId)}
            />
          </div>
        )}
        <p className="mt-3 text-sm text-ink2">{note(board)}</p>
      </ListSection>
    )
    const podiumBlock = podium && (
      <Podium
        members={podium.map((m) => ({ id: m.id, name: m.displayName, avatarSrc: m.avatarSrc, score: m.score, rank: m.rank }))}
        signed={false}
        meId={user.id}
      />
    )
    // At lg the rankings take 7 parts and a side column the other 5: the podium and Your standing on
    // Net worth, the awards and past champions on This month. A phone reads the podium above the
    // rankings and the awards below them; at lg the net-worth column sticks below the top bar.
    const side =
      board === 'all' ? (
        (podiumBlock || (showStanding && listed.length > 0)) && (
          <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(72px+var(--safe-top)+28px)] lg:col-start-2 lg:row-start-1 lg:gap-7">
            {podiumBlock}
            {showStanding && listed.length > 0 && (
              <YourStandingCard standing={standing} record={myRecords.get(user.id)} jump={jump} className="hidden lg:flex" />
            )}
          </div>
        )
      ) : (
        (awards.length > 0 || hasChampions) && (
          <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-1 lg:gap-7">
            <Awards awards={awards} />
            {hasChampions && <PastChampions champions={champions} />}
          </div>
        )
      )
    const split = listed.length > 0 && Boolean(side)
    body = (
      <>
        {showMonthExtras && <RaceChart series={race} />}
        <div
          className={cn(
            'flex flex-col gap-5 md:gap-7',
            split && 'lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start',
          )}
        >
          {board === 'all' ? (
            <>
              {side}
              {rankings}
            </>
          ) : (
            <>
              {rankings}
              {side}
            </>
          )}
        </div>
      </>
    )
  }

  return (
    <Page transition="tab">
      <PageHeader title="Leaderboard" />
      <LiveTables subscriptions={pageSubscriptions.leaderboard()} renderedAt={renderStamp()} />
      <ShowMoreFocus />
      <SubNav
        label="Ranking"
        items={(Object.keys(TABS) as Board[]).map((b) => ({ href: TABS[b].href, label: TABS[b].label, current: b === board }))}
      />
      {body}
    </Page>
  )
}
