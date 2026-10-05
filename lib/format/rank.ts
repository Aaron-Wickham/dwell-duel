export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th')
  return `${n}${suffix}`
}

// The one way a rank is written for members: "218th of 502".
export function rankText(rank: number, memberCount: number): string {
  return `${ordinal(rank)} of ${memberCount}`
}
