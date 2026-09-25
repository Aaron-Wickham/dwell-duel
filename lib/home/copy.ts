export function heroCaption(rank: number, memberCount: number, pendingCount: number, pendingDc: number): string {
  const rankPart = `Rank ${rank} of ${memberCount}`
  if (pendingCount === 0) return rankPart
  const reviewWord = pendingCount === 1 ? 'task review' : 'task reviews'
  return `${rankPart} · ${pendingDc} DC pending in ${pendingCount} ${reviewWord}`
}

export function marketsTileSubtitle(openCount: number): string {
  if (openCount === 0) return 'No open markets'
  if (openCount === 1) return '1 open market'
  return `${openCount} open markets`
}

// Reuses the spec's approved empty-slip copy ("Your slip is empty.") for the tile's zero case.
export function parlaysTileSubtitle(slipCount: number): string {
  if (slipCount === 0) return 'Your slip is empty.'
  if (slipCount === 1) return '1 pick in your slip'
  return `${slipCount} picks in your slip`
}

export function leaderboardTileSubtitle(rank: number, memberCount: number): string {
  return `You’re ranked ${rank} of ${memberCount}`
}

export function adminTileSubtitle(pendingApprovals: number): string {
  if (pendingApprovals === 0) return 'Nothing waiting'
  if (pendingApprovals === 1) return '1 approval waiting'
  return `${pendingApprovals} approvals waiting`
}
