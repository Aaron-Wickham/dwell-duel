import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

export default async function LeaderboardPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)

  return (
    <Page transition="tab">
      <PageHeader title="Leaderboard" description="Ranked by balance. Ties share a rank." />
      <LiveTables subscriptions={pageSubscriptions.leaderboard()} />
      {board.length <= 1 ? (
        <EmptyState icon={Trophy} title="No other members yet.">
          Invite friends to start the competition.
        </EmptyState>
      ) : (
        <SectionCard
          title={<span className="sr-only">Rankings</span>}
          titleId="leaderboard-rankings"
          className="max-w-[820px] gap-0 py-1.5 px-2 md:py-1.5 md:px-3"
        >
          <ol className="flex flex-col">
            {board.map((member) => (
              <LeaderboardRow
                key={member.id}
                rank={member.rank}
                name={member.displayName}
                balance={member.balance}
                isMe={member.id === user.id}
                href={`/members/${member.id}`}
              />
            ))}
          </ol>
        </SectionCard>
      )}
    </Page>
  )
}
