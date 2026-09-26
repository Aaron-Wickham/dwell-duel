import { redirect } from 'next/navigation'
import { ChartColumn, Layers, BookOpen, MessageSquareText, Trophy, ShieldCheck, LogOut } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { signOut } from '@/lib/auth/sign-out'
import { readSlip } from '@/lib/parlays/slip'
import { listMarkets } from '@/lib/markets/list-markets'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listMyTaskCompletions, listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { Page, PageHeader } from '@/components/ui/page'
import { buttonVariants } from '@/components/ui/button'
import { HomeHero } from '@/components/home/home-hero'
import { HomeTiles, type HomeTile } from '@/components/home/home-tiles'
import { adminTileSubtitle, leaderboardTileSubtitle, marketsTileSubtitle, parlaysTileSubtitle } from '@/lib/home/copy'
import { cn } from '@/lib/utils'

export default async function Home() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [admin, slip, markets, board, myCompletions] = await Promise.all([
    isAdmin(supabase),
    readSlip(),
    listMarkets(supabase),
    getLeaderboard(supabase),
    listMyTaskCompletions(supabase, user.id),
  ])
  const pendingApprovals = admin ? await listPendingTaskCompletions(supabase) : []

  const openMarketCount = markets.filter((m) => m.status === 'open').length
  const me = board.find((m) => m.id === user.id)
  const rank = me?.rank ?? board.length
  const memberCount = board.length
  const pendingReviews = myCompletions.filter((c) => c.status === 'pending')
  const pendingDc = pendingReviews.reduce((sum, c) => sum + c.rewardAmount, 0)

  const tiles: HomeTile[] = [
    { id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: marketsTileSubtitle(openMarketCount) },
    { id: 'parlays', href: '/parlays', icon: Layers, title: 'Parlays', subtitle: parlaysTileSubtitle(slip.length) },
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
  if (admin) {
    tiles.push({
      id: 'admin',
      href: '/admin/invites',
      icon: ShieldCheck,
      title: 'Admin',
      subtitle: adminTileSubtitle(pendingApprovals.length),
    })
  }

  return (
    <Page transition="tab">
      <PageHeader title={`Welcome, ${me?.displayName}`} />
      <HomeHero
        balance={me?.balance ?? 0}
        rank={rank}
        memberCount={memberCount}
        pendingCount={pendingReviews.length}
        pendingDc={pendingDc}
      />
      <HomeTiles tiles={tiles} />
      <form action={signOut}>
        <button type="submit" className={cn(buttonVariants({ variant: 'secondary', block: true }), 'md:w-auto')}>
          <LogOut aria-hidden="true" className="size-5" />
          Sign out
        </button>
      </form>
    </Page>
  )
}
