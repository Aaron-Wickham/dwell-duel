import { describe, it, expect } from 'vitest'
import { describeCreatorStake, describeOwnStake, getCreatorStakes } from '@/lib/markets/creator-stakes'
import { IN_CHUNK } from '@/lib/pagination/chunk'
import { fakeSupabase } from '../fake-supabase'

describe('getCreatorStakes', () => {
  it('sends each request only its own chunk of markets and those markets\' creators', async () => {
    // 120 markets, each by its own creator: the lists must never grow past one chunk.
    const markets = Array.from({ length: 120 }, (_, i) => ({ id: `m-${i}`, createdBy: `c-${i}` }))
    const { client, queries } = fakeSupabase(() => ({ data: [] }))

    await getCreatorStakes(client, markets)

    expect(queries).toHaveLength(6)
    for (const q of queries) {
      const lists = Object.fromEntries(q.in)
      const creators = (lists['profile_id'] ?? lists['parlays.profile_id']) as string[]
      expect(lists['market_id'].length).toBeLessThanOrEqual(IN_CHUNK)
      expect(creators.length).toBeLessThanOrEqual(IN_CHUNK)
      // Each creator listed made one of the markets listed, and no other.
      expect(creators).toEqual((lists['market_id'] as string[]).map((id) => id.replace('m-', 'c-')))
    }
  })

  it('lists a creator once per chunk however many markets they made', async () => {
    const markets = Array.from({ length: 4 }, (_, i) => ({ id: `m-${i}`, createdBy: 'c-1' }))
    const { client, queries } = fakeSupabase(() => ({ data: [] }))

    await getCreatorStakes(client, markets)

    expect(queries[0].in).toContainEqual(['profile_id', ['c-1']])
  })
})

describe('describeCreatorStake and describeOwnStake', () => {
  const stake = { solo: [{ label: 'Yes', amount: 1200 }], parlayLabels: ['No'] }

  it('says what the creator has riding, to everyone and, on the market page, to the creator (#390)', () => {
    expect(describeCreatorStake(stake, 'has')).toBe('Creator has 1,200 DC on Yes and a parlay on No.')
    expect(describeOwnStake(stake, 'have')).toBe('You have 1,200 DC on Yes and a parlay on No.')
    expect(describeOwnStake(stake, 'had')).toBe('You had 1,200 DC on Yes and a parlay on No.')
  })

  it('says nothing when there is no stake', () => {
    expect(describeOwnStake(undefined, 'have')).toBeNull()
    expect(describeOwnStake({ solo: [], parlayLabels: [] }, 'have')).toBeNull()
  })
})
