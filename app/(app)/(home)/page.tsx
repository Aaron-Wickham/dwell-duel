import { redirect } from 'next/navigation'
import { ChartColumn, Layers, BookOpen, MessageSquareText, Trophy, ShieldCheck, LogOut, Mail, Ticket, UserRound } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { adminHref, atLeast, getRole } from '@/lib/auth/roles'
import { signOut } from '@/lib/auth/sign-out'
import { countOpenMarkets } from '@/lib/markets/list-markets'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { listMyTaskCompletions, listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { Page, PageHeader } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { HomeHero } from '@/components/home/home-hero'
import { HomeTiles, type HomeTile } from '@/components/home/home-tiles'
import { InstallCard } from '@/components/home/install-card'
import { adminTileSubtitle, leaderboardTileSubtitle, marketsTileSubtitle } from '@/lib/home/copy'
import { feedbackHref } from '@/lib/app-shell/feedback'
import { cn } from '@/lib/utils'

export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [role, openMarketCount, standing, myCompletions, pendingApprovals] = await Promise.all([
    getRole(supabase),
    countOpenMarkets(supabase),
    getMemberStanding(supabase, user.id),
    listMyTaskCompletions(supabase, user.id),
    getRole(supabase).then((r) => (atLeast(r, 'reviewer') ? listPendingTaskCompletions(supabase) : [])),
  ])
  const adminLink = adminHref(role)

  const rank = standing?.rank ?? 0
  const memberCount = standing?.memberCount ?? 0
  const pendingReviews = myCompletions.filter((c) => c.status === 'pending')
  const pendingDc = pendingReviews.reduce((sum, c) => sum + c.rewardAmount, 0)

  const tiles: HomeTile[] = [
    { id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: marketsTileSubtitle(openMarketCount) },
    { id: 'bets', href: '/bets', icon: Ticket, title: 'My bets', subtitle: 'Open, settled and cancelled' },
    { id: 'parlays', href: '/parlays', icon: Layers, title: 'Parlays', subtitle: 'Parlays you’ve placed, win or lose' },
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
  tiles.push({ id: 'profile', href: '/profile', icon: UserRound, title: 'Edit profile', subtitle: 'Your name, photo and bio' })
  if (adminLink) {
    tiles.push({
      id: 'admin',
      href: adminLink,
      icon: ShieldCheck,
      title: 'Admin',
      subtitle: adminTileSubtitle(pendingApprovals.length),
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
      <PageHeader title={`Welcome, ${standing?.displayName}`} />
      <LiveTables subscriptions={pageSubscriptions.home({ me: user.id, admin: atLeast(role, 'reviewer') })} />
      <HomeHero
        balance={standing?.balance ?? 0}
        rank={rank}
        memberCount={memberCount}
        pendingCount={pendingReviews.length}
        pendingDc={pendingDc}
      />
      <HomeTiles tiles={tiles} />
      <InstallCard />
      <form action={signOut}>
        <button type="submit" className={cn(buttonVariants({ variant: 'secondary', block: true }), 'md:w-auto')}>
          <LogOut aria-hidden="true" className="size-5" />
          Sign out
        </button>
      </form>
    </Page>
  )
}
