import { formatDcAmount, formatDc } from '@/lib/format/dc'
import { FALLBACK_NAME } from '@/lib/profile/fallback-name'
import { rankText } from '@/lib/format/rank'

// "Hi, Ruth" rather than "Welcome, Ruth Newman" every visit (#388, COPY-06).
export function firstName(displayName: string | null | undefined): string {
  return displayName?.trim().split(/\s+/)[0] || FALLBACK_NAME
}

// What's riding, after the rank: "275 DC riding", or "No open bets" rather than a 0.
export function ridingText(dc: number, wagers: number): string {
  return wagers === 0 ? 'No open bets' : `${formatDcAmount(dc)} riding`
}

// The desktop Balance card's line: "218th of 502 · 275 DC riding on 30 bets". Rank is null
// until the member has a settled bet, and for a removed member.
export function standingLine({ rank, memberCount, dc, wagers }: { rank: number | null; memberCount: number; dc: number; wagers: number }): string {
  const riding = wagers === 0 ? 'No open bets' : `${formatDcAmount(dc)} riding on ${wagers === 1 ? '1 bet' : `${wagers} bets`}`
  return rank ? `${rankText(rank, memberCount)} · ${riding}` : riding
}

export function countNoun(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export type RewardRange = { min: number; max: number }

// What tasks pay, for the nudge a member at 0 DC sees, from the live catalogue.
export function taskRewardsDetail(range: RewardRange | null): string | null {
  if (!range) return null
  if (range.min === range.max) return `they pay ${formatDcAmount(range.min)} each`
  return `they pay ${formatDc(range.min)}–${formatDcAmount(range.max)}`
}
