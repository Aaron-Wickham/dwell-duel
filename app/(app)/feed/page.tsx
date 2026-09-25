import { redirect } from 'next/navigation'
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
      <FeedList events={events} />
    </div>
  )
}
