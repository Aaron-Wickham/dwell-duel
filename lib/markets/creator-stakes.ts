import type { SupabaseClient } from '@supabase/supabase-js'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'

// What a market's creator has riding on it: solo bets per outcome, and the outcomes they picked in
// parlays. Shown beside the market and its result, since in a small group trust in the result
// matters more than anything (#84). Bets and parlays are already visible to every invited member.
export type CreatorStake = { solo: { label: string; amount: number }[]; parlayLabels: string[] }

type BetRow = { market_id: string; profile_id: string; amount: number; market_outcomes: { label: string } | null }
type LegRow = { market_id: string; market_outcomes: { label: string } | null; parlays: { profile_id: string } | null }

export async function getCreatorStakes(
  supabase: SupabaseClient,
  markets: { id: string; createdBy: string }[],
): Promise<Map<string, CreatorStake>> {
  const stakes = new Map<string, CreatorStake>()
  if (markets.length === 0) return stakes
  const creatorOf = new Map(markets.map((m) => [m.id, m.createdBy]))
  const creators = [...new Set(markets.map((m) => m.createdBy))]
  const stakeFor = (marketId: string) => {
    let s = stakes.get(marketId)
    if (!s) stakes.set(marketId, (s = { solo: [], parlayLabels: [] }))
    return s
  }

  for (const ids of chunk([...creatorOf.keys()], IN_CHUNK)) {
    const [bets, legs] = await Promise.all([
      supabase.from('bets').select('market_id, profile_id, amount, market_outcomes(label)').in('market_id', ids).in('profile_id', creators),
      supabase
        .from('parlay_legs')
        .select('market_id, market_outcomes(label), parlays!inner(profile_id)')
        .in('market_id', ids)
        .in('parlays.profile_id', creators),
    ])
    if (bets.error) throw bets.error
    if (legs.error) throw legs.error

    for (const b of (bets.data ?? []) as unknown as BetRow[]) {
      if (creatorOf.get(b.market_id) !== b.profile_id) continue
      const label = b.market_outcomes?.label ?? 'an outcome'
      const solo = stakeFor(b.market_id).solo
      const existing = solo.find((s) => s.label === label)
      if (existing) existing.amount += b.amount
      else solo.push({ label, amount: b.amount })
    }
    for (const l of (legs.data ?? []) as unknown as LegRow[]) {
      if (creatorOf.get(l.market_id) !== l.parlays?.profile_id) continue
      const labels = stakeFor(l.market_id).parlayLabels
      const label = l.market_outcomes?.label ?? 'an outcome'
      if (!labels.includes(label)) labels.push(label)
    }
  }
  return stakes
}

// "Creator has 40 DC on Yes and a parlay on No." Null when they have no stake.
export function describeCreatorStake(stake: CreatorStake | undefined, tense: 'has' | 'had'): string | null {
  if (!stake || (stake.solo.length === 0 && stake.parlayLabels.length === 0)) return null
  const parts = stake.solo.map((s) => `${s.amount} DC on ${s.label}`)
  if (stake.parlayLabels.length > 0) parts.push(`a parlay on ${stake.parlayLabels.join(' and ')}`)
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `Creator ${tense} ${joined}.`
}
