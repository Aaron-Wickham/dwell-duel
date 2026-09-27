import { describe, it, expect } from 'vitest'
import { assignRanks } from '@/lib/social/ranking'

describe('assignRanks', () => {
  it('assigns index + 1 to already-sorted, distinct balances', () => {
    expect(assignRanks([{ balance: 150 }, { balance: 90 }, { balance: 50 }]).map((m) => m.rank)).toEqual([1, 2, 3])
  })

  it('gives equal balances the same rank and skips to the next index', () => {
    expect(assignRanks([{ balance: 150 }, { balance: 150 }, { balance: 90 }]).map((m) => m.rank)).toEqual([1, 1, 3])
  })

  it('keeps every other field on the input untouched', () => {
    expect(assignRanks([{ id: 'a', balance: 10 }])).toEqual([{ id: 'a', balance: 10, rank: 1 }])
  })

  it('returns an empty list for no members', () => {
    expect(assignRanks([])).toEqual([])
  })
})
