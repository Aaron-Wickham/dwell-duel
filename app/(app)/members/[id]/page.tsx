import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { Page, h1Class } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'
import { FeedList } from '@/app/(app)/feed/feed-list'

export default async function MemberPage(props: PageProps<'/members/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)
  const member = board.find((m) => m.id === id)
  if (!member) notFound()

  const events = await listFeed(supabase, { actorId: member.id })

  return (
    <Page>
      <BackLink href="/leaderboard">Leaderboard</BackLink>
      <section className="flex items-center gap-4 md:gap-5">
        <Avatar name={member.displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className={h1Class}>{member.displayName}</h1>
          <p className="text-[18px] font-extrabold tabular-nums">
            {member.balance} DC · Rank {member.rank} of {board.length}
          </p>
        </div>
      </section>
      <FeedList events={events} heading="Recent activity" headingId="recent-activity" />
    </Page>
  )
}
