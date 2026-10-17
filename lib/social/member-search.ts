import { TEXT_LIMITS } from '@/lib/forms/limits'

// The leaderboard's ?q= (#465), read as Markets reads its own (readMarketSearch): control
// characters and `*` out (containsPattern can't escape a `*`), runs of whitespace collapsed, and
// capped at the longest display name by code points, since a longer search can't match more.
export function readMemberSearch(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  const text = (value ?? '').replace(/\p{Cc}/gu, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  return [...text].slice(0, TEXT_LIMITS.displayName).join('').trim()
}
