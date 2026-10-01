import { describe, it, expect } from 'vitest'
import { SEARCH_MAX, containsPattern, readSearchQuery } from '@/lib/search/query'

describe('readSearchQuery', () => {
  it('trims ?q= and caps its length', () => {
    expect(readSearchQuery('  an ')).toBe('an')
    expect(readSearchQuery(undefined)).toBe('')
    expect(readSearchQuery(['a', 'b'])).toBe('')
    expect(readSearchQuery('x'.repeat(SEARCH_MAX + 20))).toHaveLength(SEARCH_MAX)
  })
})

describe('containsPattern', () => {
  it('matches anywhere, taking \\, % and _ literally and dropping PostgREST’s * wildcard', () => {
    expect(containsPattern('pat')).toBe('%pat%')
    expect(containsPattern('a_b%c\\d')).toBe('%a\\_b\\%c\\\\d%')
    expect(containsPattern('a*b')).toBe('%ab%')
  })
})
