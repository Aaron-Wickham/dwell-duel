import { describe, it, expect } from 'vitest'
import { rankMembers } from '@/lib/social/ranking'

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
