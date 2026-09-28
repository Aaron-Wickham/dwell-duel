export type NavId = 'home' | 'markets' | 'bets' | 'parlays' | 'tasks' | 'feed' | 'leaderboard' | 'admin'

export interface NavItem {
  id: NavId
  href: string
  label: string
  shortLabel: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', href: '/', label: 'Home', shortLabel: 'Home' },
  { id: 'markets', href: '/markets', label: 'Markets', shortLabel: 'Markets' },
  { id: 'bets', href: '/bets', label: 'My bets', shortLabel: 'Bets' },
  { id: 'parlays', href: '/parlays', label: 'Parlays', shortLabel: 'Parlays' },
  { id: 'tasks', href: '/tasks', label: 'Tasks', shortLabel: 'Tasks' },
  { id: 'feed', href: '/feed', label: 'Feed', shortLabel: 'Feed' },
  { id: 'leaderboard', href: '/leaderboard', label: 'Leaderboard', shortLabel: 'Leaders' },
]

export const ADMIN_HREF = '/admin/invites'

export function activeNavId(pathname: string): NavId | null {
  if (pathname === '/') return 'home'
  switch (pathname.split('/')[1]) {
    case 'markets':
      return 'markets'
    case 'bets':
      return 'bets'
    case 'parlays':
      return 'parlays'
    case 'tasks':
      return 'tasks'
    case 'feed':
      return 'feed'
    case 'leaderboard':
    case 'members':
      return 'leaderboard'
    case 'admin':
      return 'admin'
    default:
      return null
  }
}
