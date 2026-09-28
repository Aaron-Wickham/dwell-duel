export type NavId = 'markets' | 'bets' | 'tasks' | 'feed' | 'leaderboard' | 'admin'

export interface NavItem {
  id: NavId
  href: string
  label: string
  shortLabel: string
}

// Home has no tab: the wordmark is the way home. Parlays live on My bets beside solo bets.
export const NAV_ITEMS: NavItem[] = [
  { id: 'markets', href: '/markets', label: 'Markets', shortLabel: 'Markets' },
  { id: 'bets', href: '/bets', label: 'My bets', shortLabel: 'Bets' },
  { id: 'tasks', href: '/tasks', label: 'Tasks', shortLabel: 'Tasks' },
  { id: 'feed', href: '/feed', label: 'Feed', shortLabel: 'Feed' },
  { id: 'leaderboard', href: '/leaderboard', label: 'Leaderboard', shortLabel: 'Leaders' },
]

export function activeNavId(pathname: string): NavId | null {
  switch (pathname.split('/')[1]) {
    case 'markets':
      return 'markets'
    case 'bets':
      return 'bets'
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
