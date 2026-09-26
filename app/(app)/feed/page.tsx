import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { Page, PageHeader } from '@/components/ui/page'
import { FeedList } from './feed-list'

export default async function FeedPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const events = await listFeed(supabase)

  return (
    <Page>
      <PageHeader title="Feed" description="The 50 newest things that happened in DwellDuel." />
      <FeedList events={events} heading="Events" headingId="feed-events" headingHidden />
    </Page>
  )
}
