import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { FeedList } from './feed-list'

export default async function FeedPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const events = await listFeed(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Feed</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/" className="text-sm underline">
          Home
        </Link>
        <Link href="/leaderboard" className="text-sm underline">
          Leaderboard
        </Link>
      </div>
      <FeedList events={events} />
    </div>
  )
}
