import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { readPageParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import Link from 'next/link'
import { Page, rowTitleClass } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { HistoryBackLink } from '@/components/ui/history-back-link'
import { MemberProfileHeader } from '@/components/members/member-profile-header'
import { SkeletonScreen } from '@/components/ui/skeleton'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'
import { LoadingStatus } from '@/components/ui/loading-status'
import { MemberStatsSkeleton } from '@/components/members/member-stats-card'
import { MemberActivity } from './member-activity'
import { MemberStats } from './member-stats'
import { formatDcAmount } from '@/lib/format/dc'

// No loading.tsx for this route: the member must be found before anything streams, so an
// unknown id still gets a real 404 status. The stats and the activity list stream in behind
// skeletons, under one combined loading status.
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
      <LiveTables subscriptions={pageSubscriptions.member(member.id)} renderedAt={renderStamp()} />
      <LoadingStatus>
        <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-5 md:gap-7">
            <section className="flex flex-col gap-4">
              <MemberProfileHeader name={member.displayName} avatarSrc={member.avatarSrc} bio={member.bio}>
                <div className="flex flex-col gap-0.5">
                  <p className={rowTitleClass}>
                    {formatDcAmount(member.score)} net worth ·{' '}
                    {member.rank === null ? 'Not ranked' : `Rank ${member.rank} of ${member.memberCount}`}
                  </p>
                  {/* Net worth isn't the balance in the top bar, so say how the two add up (CR-B15). */}
                  <p className="text-sm text-ink2">
                    {formatDcAmount(member.balance)} balance + {formatDcAmount(member.score - member.balance)} riding on open bets
                  </p>
                </div>
              </MemberProfileHeader>
              {member.id === user.id && (
                <div className="flex flex-wrap gap-3">
                  <Link href="/profile" transitionTypes={['nav-forward']} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Edit profile
                  </Link>
                  <Link href="/settings" transitionTypes={['nav-forward']} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Settings
                  </Link>
                </div>
              )}
            </section>
            <Suspense
              fallback={
                <SkeletonScreen name="member-stats" announce={false}>
                  <MemberStatsSkeleton />
                </SkeletonScreen>
              }
            >
              <MemberStats memberId={member.id} />
            </Suspense>
          </div>
          <div className="flex min-w-0 flex-col">
            <Suspense
              fallback={
                <SkeletonScreen name="member-activity" announce={false}>
                  <FeedListSkeleton reactions />
                </SkeletonScreen>
              }
            >
              <MemberActivity memberId={member.id} page={readPageParams(searchParams, 'activity')} searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </LoadingStatus>
    </Page>
  )
}
