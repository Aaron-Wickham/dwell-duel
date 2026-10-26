import { formatDcAmount, formatDc } from '@/lib/format/dc'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'
import { rankText } from '@/lib/format/rank'

// "Hi, Ruth" rather than "Welcome, Ruth Newman" every visit (#388, COPY-06).
export function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || FALLBACK_NAME
}

// The Balance card's line: "218th of 502 · 275 DC in 30 open bets" (C-8: "riding" is betting
// slang). Rank is null until the member has a settled bet, and for a removed member; what's at stake
// is null when it couldn't be read, so the line keeps the rank alone, or is empty.
export function standingLine({ rank, memberCount, riding }: { rank: number | null; memberCount: number; riding: { dc: number; wagers: number } | null }): string {
  const parts = rank ? [rankText(rank, memberCount)] : []
  if (riding) {
    parts.push(riding.wagers === 0 ? 'No open bets' : `${formatDcAmount(riding.dc)} in ${riding.wagers === 1 ? '1 open bet' : `${riding.wagers} open bets`}`)
  }
  return parts.join(' · ')
}

export function countNoun(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export type RewardRange = { min: number; max: number }

// What tasks pay, for the nudge a member at 0 DC sees, from the live catalogue.
export function taskRewardsDetail(range: RewardRange | null): string | null {
  if (!range) return null
  if (range.min === range.max) return `they pay ${formatDcAmount(range.min)} each`
  return `they pay ${formatDc(range.min)} to ${formatDcAmount(range.max)}`
}
