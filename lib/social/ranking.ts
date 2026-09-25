export interface LeaderboardEntry {
  id: string
  displayName: string
  balance: number
  rank: number
}

export function rankMembers(members: { id: string; displayName: string; balance: number }[]): LeaderboardEntry[] {
  const sorted = [...members].sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName))
  const ranked: LeaderboardEntry[] = []
  sorted.forEach((m, index) => {
    const previous = ranked[index - 1]
    const rank = previous && previous.balance === m.balance ? previous.rank : index + 1
    ranked.push({ ...m, rank })
  })
  return ranked
}
