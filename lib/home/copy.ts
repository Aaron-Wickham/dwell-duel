export function atStakeDetail(wagers: number): string {
  if (wagers === 0) return 'Nothing riding'
  return wagers === 1 ? 'on 1 bet' : `on ${wagers} bets`
}

export function pendingDetail(reviews: number): string {
  return reviews === 1 ? 'in 1 review' : `in ${reviews} reviews`
}

export function marketsTileSubtitle(openCount: number): string {
  if (openCount === 0) return 'No open markets'
  if (openCount === 1) return '1 open market'
  return `${openCount} open markets`
}

// Rank 0 means the member has no profile row, so there's no standing to report.
export function leaderboardTileSubtitle(rank: number, memberCount: number): string {
  if (rank === 0) return 'See who’s leading'
  return `You’re ranked ${rank} of ${memberCount}`
}

// The same counts as the Admin badge (#266): another member's task submissions, and for an admin,
// closed markets waiting on a result (a reviewer's market count is always 0).
export function adminTileSubtitle({ tasks, markets }: { tasks: number; markets: number }): string {
  const approvals = tasks === 1 ? '1 approval' : `${tasks} approvals`
  const toResolve = markets === 1 ? '1 market to resolve' : `${markets} markets to resolve`
  if (tasks > 0 && markets > 0) return `${approvals}, ${toResolve}`
  if (tasks > 0) return `${approvals} waiting`
  if (markets > 0) return toResolve
  return 'Nothing waiting'
}

export type RewardRange = { min: number; max: number }

// What tasks pay, for the nudge a member at 0 DC sees, from the live catalogue.
export function taskRewardsDetail(range: RewardRange | null): string | null {
  if (!range) return null
  if (range.min === range.max) return `they pay ${range.min} DC each`
  return `they pay ${range.min}–${range.max} DC`
}

// Where the Admin tile goes: the queue that has work in it, approvals first, else the usual start.
export function adminTileHref({ tasks, markets }: { tasks: number; markets: number }, fallback: string): string {
  if (tasks > 0) return '/admin/tasks'
  if (markets > 0) return '/admin/markets'
  return fallback
}
