export type BackSwipeInput = { dx: number; dy: number; width: number; velocity: number }

// A swipe has to start this close to the left edge.
export const BACK_SWIPE_EDGE = 20
// Movement below this doesn't yet say whether the finger is going sideways or scrolling.
export const BACK_SWIPE_SLOP = 8

const FLICK_VELOCITY = 0.5

export function backSwipeDecision({ dx, dy, width, velocity }: BackSwipeInput): 'complete' | 'cancel' | 'ignore' {
  if (Math.abs(dy) > Math.abs(dx)) return 'ignore'
  if (dx > 0 && (dx >= width / 3 || velocity > FLICK_VELOCITY)) return 'complete'
  return 'cancel'
}

export function logicalParent(pathname: string): string {
  const [first, second, third] = pathname.split('/').filter(Boolean)
  if (first === 'admin' && second === 'members' && third) return '/admin/members'
  if (first === 'markets' && second) return '/markets'
  if (first === 'members' && second) return '/leaderboard'
  if (first === 'how-it-works' && second) return '/how-it-works'
  if (first === 'parlays' && second) return '/bets'
  return '/'
}
