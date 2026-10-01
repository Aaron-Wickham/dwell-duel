import { redirect } from 'next/navigation'
import { ChartColumn, BookOpen, MessageSquareText, Trophy, ShieldCheck, Mail, Ticket } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { adminHref, atLeast, getRole } from '@/lib/auth/roles'
import { countOpenMarkets } from '@/lib/markets/list-markets'
import { getAtStake } from '@/lib/home/at-stake'
import { getOnboarding } from '@/lib/home/onboarding'
import { OnboardingCard } from '@/components/home/onboarding-card'
import { getMarketsToResolve, nextResolveCheckAt } from '@/lib/markets/markets-to-resolve'
import { MarketsToResolveCard } from '@/components/home/markets-to-resolve-card'
import { RefreshAt } from '@/components/home/refresh-at'
import { getWeeklyRecap } from '@/lib/home/recap'
import { WeeklyRecapCard } from '@/components/home/weekly-recap-card'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { getMyPendingRewards } from '@/lib/tasks/list-task-completions'
import { getReviewCounts } from '@/lib/admin/review-counts'
import { Page, PageHeader } from '@/components/ui/page'
import { HomeHero } from '@/components/home/home-hero'
import { HomeTiles, type HomeTile } from '@/components/home/home-tiles'
import { InstallCard } from '@/components/home/install-card'
import { NotificationsCard } from '@/components/home/notifications-card'
import { adminTileHref, adminTileSubtitle, leaderboardTileSubtitle, marketsTileSubtitle } from '@/lib/home/copy'
import { getTaskRewardRange } from '@/lib/tasks/list-tasks'
import { feedbackHref } from '@/lib/app-shell/feedback'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'

export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [
    role,
    openMarketCount,
    standing,
    pendingReviews,
    reviewCounts,
    atStake,
    marketsToResolve,
    nextResolveCheck,
    onboarding,
    weeklyRecap,
  ] = await Promise.all([
    getRole(supabase),
    countOpenMarkets(supabase),
    getMemberStanding(supabase, user.id),
    getMyPendingRewards(supabase, user.id),
    // The same count as the Admin badge: other members' submissions, never the viewer's own (#221).
    getRole(supabase).then((r) => getReviewCounts(supabase, r)),
    getAtStake(supabase),
    getMarketsToResolve(supabase),
    getRole(supabase).then((r) => nextResolveCheckAt(supabase, user.id, atLeast(r, 'reviewer'))),
    getOnboarding(supabase),
    getWeeklyRecap(supabase),
  ])
  const adminLink = adminHref(role)

  const rank = standing?.rank ?? 0
  const memberCount = standing?.memberCount ?? 0
  const balance = standing?.balance ?? 0
  // Only a member with nothing left sees what tasks pay, so only they pay for the read.
  const taskRewards = balance === 0 ? await getTaskRewardRange(supabase) : null

  const tiles: HomeTile[] = [
    { id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: marketsTileSubtitle(openMarketCount) },
    { id: 'bets', href: '/bets', icon: Ticket, title: 'My bets', subtitle: 'Solo bets and parlays, open and settled' },
    { id: 'tasks', href: '/tasks', icon: BookOpen, title: 'Tasks', subtitle: 'Earn DC with Bible study' },
    { id: 'feed', href: '/feed', icon: MessageSquareText, title: 'Feed', subtitle: 'What everyone’s been up to' },
    {
      id: 'leaderboard',
      href: '/leaderboard',
      icon: Trophy,
      title: 'Leaderboard',
      subtitle: leaderboardTileSubtitle(rank, memberCount),
    },
  ]
  if (adminLink) {
    tiles.push({
      id: 'admin',
      href: adminTileHref(reviewCounts, adminLink),
      icon: ShieldCheck,
      title: 'Admin',
      subtitle: adminTileSubtitle(reviewCounts),
    })
  }
  tiles.push({
    id: 'feedback',
    href: feedbackHref(),
    icon: Mail,
    title: 'Send feedback',
    subtitle: 'Tell Aaron what’s working and what isn’t',
  })

  return (
    <Page transition="tab">
      <PageHeader title={`Welcome, ${standing?.displayName ?? FALLBACK_NAME}`} />
      <LiveTables subscriptions={pageSubscriptions.home({ me: user.id, reviewer: atLeast(role, 'reviewer') })} />
      <HomeHero
        balance={balance}
        rank={rank}
        memberCount={memberCount}
        atStakeDc={atStake.dc}
        atStakeWagers={atStake.wagers}
        pendingCount={pendingReviews.count}
        pendingDc={pendingReviews.dc}
        taskRewards={taskRewards}
      />
      <OnboardingCard steps={onboarding} />
      <NotificationsCard onboardingShown={onboarding !== null} />
      <MarketsToResolveCard {...marketsToResolve} />
      <RefreshAt at={nextResolveCheck} />
      <WeeklyRecapCard recap={weeklyRecap} />
      <HomeTiles tiles={tiles} />
      <InstallCard />
    </Page>
  )
}
