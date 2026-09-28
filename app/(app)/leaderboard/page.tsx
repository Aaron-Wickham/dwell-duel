import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { newestHref, showMoreHref } from '@/lib/pagination/cursor'
import { readRankPageParams } from '@/lib/pagination/rank-cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

const ROW_ID_PREFIX = 'member'

export default async function LeaderboardPage(props: PageProps<'/leaderboard'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboardPage(supabase, readRankPageParams(searchParams, 'before'))
  const backToNewestHref = newestHref('/leaderboard', searchParams, 'before')

  return (
    <Page transition="tab">
      <PageHeader title="Leaderboard" description="Ranked by balance. Ties share a rank." />
      <LiveTables subscriptions={pageSubscriptions.leaderboard()} />
      <ShowMoreFocus />
      {board.windowed && board.rows.length === 0 ? (
        <NothingOlder href={backToNewestHref} />
      ) : !board.windowed && board.rows.length <= 1 ? (
        <EmptyState icon={Trophy} title="No other members yet.">
          Invite friends to start the competition.
        </EmptyState>
      ) : (
        <SectionCard
          title={<span className="sr-only">Rankings</span>}
          titleId="leaderboard-rankings"
          className="max-w-[820px] gap-0 py-1.5 px-2 md:py-1.5 md:px-3"
        >
          {board.windowed && (
            <div className="flex flex-col px-2.5 py-2.5 md:px-3.5">
              <BackToNewest href={backToNewestHref} />
            </div>
          )}
          <ol className="flex flex-col">
            {board.rows.map((member) => (
              <LeaderboardRow
                key={member.id}
                rank={member.rank}
                name={member.displayName}
                balance={member.balance}
                isMe={member.id === user.id}
                href={`/members/${member.id}`}
                domId={rowDomId(ROW_ID_PREFIX, member.id)}
              />
            ))}
          </ol>
          {board.next && (
            <div className="flex flex-col px-2.5 py-2.5 md:px-3.5">
              <ShowMore
                href={showMoreHref('/leaderboard', searchParams, 'before', board.next)}
                fresh={board.next.kind === 'window'}
                focusId={rowDomId(ROW_ID_PREFIX, board.next.firstId)}
              />
            </div>
          )}
        </SectionCard>
      )}
    </Page>
  )
}
