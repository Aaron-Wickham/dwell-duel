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

export function adminTileSubtitle(pendingApprovals: number): string {
  if (pendingApprovals === 0) return 'Nothing waiting'
  if (pendingApprovals === 1) return '1 approval waiting'
  return `${pendingApprovals} approvals waiting`
}
