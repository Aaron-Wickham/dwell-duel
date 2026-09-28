import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { readPageParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import Link from 'next/link'
import { Settings, UserRound } from 'lucide-react'
import { Page, h1Class } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { HistoryBackLink } from '@/components/ui/history-back-link'
import { Avatar } from '@/components/ui/avatar'
import { SkeletonScreen } from '@/components/ui/skeleton'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'
import { MemberActivity } from './member-activity'

// No loading.tsx for this route: the member must be found before anything streams, so an
// unknown id still gets a real 404 status. Only the activity list streams in behind a skeleton.
export default async function MemberPage(props: PageProps<'/members/[id]'>) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  const member = await getMemberStanding(supabase, id)
  if (!member) notFound()

  return (
    <Page transition="drill-down">
      <HistoryBackLink />
      <LiveTables subscriptions={pageSubscriptions.member(member.id)} />
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-4 md:gap-5">
          <Avatar name={member.displayName} src={member.avatarSrc} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className={`${h1Class} break-words`}>{member.displayName}</h1>
            <p className="text-[18px] font-extrabold tabular-nums">
              {member.balance} DC · Rank {member.rank} of {member.memberCount}
            </p>
          </div>
        </div>
        {member.bio && <p className="max-w-[640px] whitespace-pre-line break-words">{member.bio}</p>}
        {member.id === user.id && (
          <div className="flex flex-wrap gap-3">
            <Link href="/profile" transitionTypes={['nav-forward']} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <UserRound aria-hidden="true" className="size-[18px]" />
              Edit profile
            </Link>
            <Link href="/settings" transitionTypes={['nav-forward']} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Settings aria-hidden="true" className="size-[18px]" />
              Settings
            </Link>
          </div>
        )}
      </section>
      <Suspense
        fallback={
          <SkeletonScreen name="member-activity">
            <FeedListSkeleton />
          </SkeletonScreen>
        }
      >
        <MemberActivity memberId={member.id} page={readPageParams(searchParams, 'activity')} searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}
