import { describe, it, expect } from 'vitest'
import { currentSeasonName, seasonName, seasonOfEventId, signedDc } from '@/lib/social/season'

describe('signedDc', () => {
  it.each([
    [140, '+140 DC'],
    [-25, '−25 DC'],
    [0, '0 DC'],
  ])('shows %i as %s', (amount, text) => {
    expect(signedDc(amount)).toBe(text)
  })
})

describe('seasonOfEventId', () => {
  it("reads the month from a champion event's id", () => {
    expect(seasonOfEventId('season:2026-08')).toBe('2026-08')
  })

  it.each(['bet:12', 'season:2026-8', 'season:2026-08:x', ''])('reads %j as no season', (id) => {
    expect(seasonOfEventId(id)).toBeNull()
  })
})

describe('seasonName', () => {
  const now = new Date('2026-09-28T12:00:00Z')

  it("names a month of the current year without the year", () => {
    expect(seasonName('2026-08', now)).toBe('August')
    expect(seasonName('2026-01', now)).toBe('January')
  })

  it('adds the year to a month of another year', () => {
    expect(seasonName('2025-12', now)).toBe('December 2025')
  })
})

describe('currentSeasonName', () => {
  it('uses Eastern time, so the first hours of a month in UTC are still the old month', () => {
    // 02:00 UTC on 1 October is 22:00 on 30 September in New York.
    expect(currentSeasonName(new Date('2026-10-01T02:00:00Z'))).toBe('September')
    expect(currentSeasonName(new Date('2026-10-01T05:00:00Z'))).toBe('October')
  })
})
