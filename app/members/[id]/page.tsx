import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { FeedList } from '@/app/feed/feed-list'

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
      <div className="mt-2 flex gap-4">
        <Link href="/leaderboard" className="text-sm underline">
          Leaderboard
        </Link>
        <Link href="/feed" className="text-sm underline">
          Feed
        </Link>
      </div>
      <h2 className="mt-6 text-lg font-semibold">Recent activity</h2>
      <FeedList events={events} />
    </div>
  )
}
