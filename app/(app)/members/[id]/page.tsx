import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
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
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{member.displayName}</h1>
      <p className="mt-1 text-sm">
        {member.balance} DC · Rank {member.rank} of {board.length}
      </p>
      <h2 className="mt-6 text-lg font-semibold">Recent activity</h2>
      <FeedList events={events} />
    </div>
  )
}
