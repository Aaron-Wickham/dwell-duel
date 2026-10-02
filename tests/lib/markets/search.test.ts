import { describe, it, expect } from 'vitest'
import { MARKET_SEARCH_MAX, likePattern, marketsHref, readMarketSearch } from '@/lib/markets/search'

describe('readMarketSearch', () => {
  it('trims, collapses whitespace and reads the first of a repeated param', () => {
    expect(readMarketSearch('  rain   tomorrow ')).toBe('rain tomorrow')
    expect(readMarketSearch(['rain', 'snow'])).toBe('rain')
    expect(readMarketSearch(undefined)).toBe('')
  })

  it('drops control characters and the * PostgREST would read as a wildcard', () => {
    expect(readMarketSearch('a\u0000b\nc')).toBe('a b c')
    expect(readMarketSearch('r*ain')).toBe('rain')
    expect(readMarketSearch('***')).toBe('')
  })

  it('caps the length by code points, never splitting a surrogate pair', () => {
    expect(readMarketSearch('a'.repeat(500))).toHaveLength(MARKET_SEARCH_MAX)
    const capped = readMarketSearch('🎲'.repeat(500))
    expect([...capped]).toHaveLength(MARKET_SEARCH_MAX)
    expect(capped).not.toMatch(/[\uD800-\uDBFF]$/)
  })
})

describe('likePattern', () => {
  it('wraps the text so it matches anywhere in a title', () => {
    expect(likePattern('rain')).toBe('%rain%')
  })

  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(likePattern('100%')).toBe('%100\\%%')
    expect(likePattern('snake_case')).toBe('%snake\\_case%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
  })

  it('leaves filter syntax as inert text, since it travels as a parameter of its own', () => {
    expect(likePattern('a),status.eq.open,(b')).toBe('%a),status.eq.open,(b%')
  })

  it('never lets a * through to be read as %', () => {
    expect(likePattern('a*b')).toBe('%ab%')
  })
})

describe('marketsHref', () => {
  it('is /markets for the default view', () => {
    expect(marketsHref({})).toBe('/markets')
    expect(marketsHref({ status: 'all', q: '', category: null })).toBe('/markets')
  })

  it('combines the search, the status and the category, encoding the search', () => {
    expect(marketsHref({ q: 'a&b c', status: 'open', category: 'bible-study' })).toBe('/markets?q=a%26b+c&status=open&category=bible-study')
  })
})
