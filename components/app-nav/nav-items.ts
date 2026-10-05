export type NavId = 'home' | 'markets' | 'bets' | 'tasks' | 'leaderboard'

export interface NavItem {
  id: NavId
  href: string
  label: string
  shortLabel: string
}

// D1 (#385): Home is a tab and carries the feed as its Activity section, so Feed has none. Parlays
// live on My bets beside solo bets. Admin is reached from Home's Needs you and the avatar menu.
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', href: '/', label: 'Home', shortLabel: 'Home' },
  { id: 'markets', href: '/markets', label: 'Markets', shortLabel: 'Markets' },
  { id: 'bets', href: '/bets', label: 'My bets', shortLabel: 'Bets' },
  { id: 'tasks', href: '/tasks', label: 'Tasks', shortLabel: 'Tasks' },
  { id: 'leaderboard', href: '/leaderboard', label: 'Leaderboard', shortLabel: 'Leaders' },
]

// Voice control says the word on screen, so a phone tab's accessible name has to contain its short
// label; "Leaders" isn't inside "Leaderboard".
export function tabAriaLabel({ label, shortLabel }: NavItem): string | undefined {
  if (label.toLowerCase().includes(shortLabel.toLowerCase())) return label === shortLabel ? undefined : label
  return `${shortLabel}, ${label.toLowerCase()}`
}

// Activity (/feed) is opened from Home, so Home stays marked there. Admin has no tab.
export function activeNavId(pathname: string): NavId | null {
  switch (pathname.split('/')[1]) {
    case '':
    case 'feed':
      return 'home'
    case 'markets':
      return 'markets'
    case 'bets':
      return 'bets'
    case 'tasks':
      return 'tasks'
    case 'leaderboard':
    case 'members':
      return 'leaderboard'
    default:
      return null
  }
}
