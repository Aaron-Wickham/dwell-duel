import { describe, it, expect } from 'vitest'
import { rankMembers, assignRanks } from '@/lib/social/ranking'

describe('rankMembers', () => {
  it('ranks by balance, highest first', () => {
    expect(
      rankMembers([
        { id: 'a', displayName: 'Ann', balance: 50 },
        { id: 'b', displayName: 'Ben', balance: 120 },
      ]).map((m) => [m.displayName, m.rank]),
    ).toEqual([
      ['Ben', 1],
      ['Ann', 2],
    ])
  })

  it('gives ties the same rank, orders them by name, and skips the next rank', () => {
    expect(
      rankMembers([
        { id: 'c', displayName: 'Cal', balance: 90 },
        { id: 'b', displayName: 'Bea', balance: 150 },
        { id: 'a', displayName: 'Abe', balance: 150 },
      ]).map((m) => [m.displayName, m.rank]),
    ).toEqual([
      ['Abe', 1],
      ['Bea', 1],
      ['Cal', 3],
    ])
  })

  it('returns an empty list for no members', () => {
    expect(rankMembers([])).toEqual([])
  })
})

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
