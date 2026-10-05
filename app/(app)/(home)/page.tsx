import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { renderStamp } from '@/lib/live/render-stamp'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { atLeast, getRole } from '@/lib/auth/roles'
import { getAtStake } from '@/lib/home/at-stake'
import { getOnboarding } from '@/lib/home/onboarding'
import { getClosingSoon, getHomeHistory, getMarketsClosingSoon } from '@/lib/home/closing-soon'
import { OnboardingCard } from '@/components/home/onboarding-card'
import { getMarketsToResolve, nextResolveCheckAt } from '@/lib/markets/markets-to-resolve'
import { RefreshAt } from '@/components/home/refresh-at'
import { getWeeklyRecap } from '@/lib/home/recap'
import { WeeklyRecapCard } from '@/components/home/weekly-recap-card'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { getReviewCounts } from '@/lib/admin/review-counts'
import { listLatestFeed } from '@/lib/social/list-feed'
import { Page, h1Class } from '@/components/ui/page'
import { NotificationsCard } from '@/components/home/notifications-card'
import { NeedsYou } from '@/components/home/needs-you'
import { YourBets } from '@/components/home/your-bets'
import { HomeActivity } from '@/components/home/home-activity'
import { BalanceCard } from '@/components/home/balance-card'
import { firstName, ridingText } from '@/lib/home/copy'
import { getTaskRewardRange } from '@/lib/tasks/list-tasks'
import { formatDcAmount } from '@/lib/format/dc'

const ACTIVITY_ROWS = 3

// #388: a greeting, then what needs you, your bets closing soonest and the newest activity. On a
// phone it's one column of rows in that order; from lg, your bets and activity sit on the left
// (7fr) and the balance and Needs you on the right (5fr). Below lg each column is
// `display: contents`, so its children join one flex column and `order` interleaves them.
export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const role = await getRole(supabase)
  const reviewer = atLeast(role, 'reviewer')
  const admin = atLeast(role, 'admin')
  const [standing, reviewCounts, atStake, marketsToResolve, nextResolveCheck, onboarding, weeklyRecap, history, wagers, activity] =
    await Promise.all([
      getMemberStanding(supabase, user.id),
      // The same counts as the avatar's dot: other members' submissions, never the viewer's own (#221).
      getReviewCounts(supabase, role),
      getAtStake(supabase),
      getMarketsToResolve(supabase),
      nextResolveCheckAt(supabase, user.id, reviewer),
      getOnboarding(supabase),
      getWeeklyRecap(supabase),
      getHomeHistory(supabase, user.id),
      getClosingSoon(supabase, user.id),
      listLatestFeed(supabase, ACTIVITY_ROWS),
    ])
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const balance = standing?.balance ?? 0
  // A newcomer's rank says only that they're last (CR-A14), so it waits for a settled bet.
  const rank = history.settledBet ? (standing?.rank ?? null) : null
  const memberCount = standing?.memberCount ?? 0
  // Only a member with nothing left sees what tasks pay, and only one with nothing open sees the
  // markets closing soonest, so only they pay for those reads.
  const [taskRewards, closingMarkets] = await Promise.all([
    balance === 0 ? getTaskRewardRange(supabase) : null,
    wagers.length === 0 ? getMarketsClosingSoon(supabase, 3, now) : [],
  ])
  // Getting started retires once a member has a settled bet and an approved task.
  const veteran = history.settledBet && history.approvedTask
  const onboardingSteps = veteran ? null : onboarding

  return (
    <Page transition="tab">
      <LiveTables subscriptions={pageSubscriptions.home({ me: user.id, reviewer })} renderedAt={renderStamp()} />
      <RefreshAt at={nextResolveCheck} />
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex flex-col gap-7 max-lg:contents">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 max-lg:order-1">
            <h1 className={h1Class}>Hi, {firstName(standing?.displayName)}</h1>
            <p className="text-sm text-ink2 lg:hidden">
              {rank !== null && `Rank ${rank} · `}
              {atStake.wagers === 0 ? (
                ridingText(0, 0)
              ) : (
                <>
                  <b className="text-ink">{formatDcAmount(atStake.dc)}</b> riding
                </>
              )}
            </p>
          </div>
          <div className="contents max-lg:[&>*]:order-3">
            <OnboardingCard steps={onboardingSteps} />
          </div>
          <div className="contents max-lg:[&>*]:order-4">
            <YourBets wagers={wagers} openCount={atStake.wagers} markets={closingMarkets} now={now} />
          </div>
          <div className="contents max-lg:[&>*]:order-5">
            <NotificationsCard onboardingShown={onboardingSteps !== null} />
          </div>
          <div className="contents max-lg:[&>*]:order-6">
            <HomeActivity events={activity} now={now} />
          </div>
          <div className="contents max-lg:[&>*]:order-7">
            <WeeklyRecapCard recap={weeklyRecap} />
          </div>
        </div>
        <div className="flex flex-col gap-7 max-lg:contents lg:pt-[73px]">
          <BalanceCard
            balance={balance}
            rank={rank}
            memberCount={memberCount}
            ridingDc={atStake.dc}
            ridingWagers={atStake.wagers}
          />
          <div className="contents max-lg:[&>*]:order-2">
            <NeedsYou
              counts={reviewCounts}
              showReviews={reviewer}
              showAdminMarkets={admin}
              marketsToResolve={marketsToResolve}
              balance={balance}
              taskRewards={taskRewards}
            />
          </div>
        </div>
      </div>
    </Page>
  )
}
