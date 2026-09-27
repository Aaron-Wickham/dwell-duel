export interface LeaderboardEntry {
  id: string
  displayName: string
  balance: number
  rank: number
}

// Input is already sorted by balance desc (SQL does the ordering now); this only assigns tied
// ranks to that SQL-ordered read.
export function assignRanks<T extends { balance: number }>(sorted: T[]): (T & { rank: number })[] {
  const ranked: (T & { rank: number })[] = []
  sorted.forEach((m, index) => {
    const previous = ranked[index - 1]
    const rank = previous && previous.balance === m.balance ? previous.rank : index + 1
    ranked.push({ ...m, rank })
  })
  return ranked
}
