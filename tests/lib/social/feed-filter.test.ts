import { describe, it, expect } from 'vitest'
import { feedShowHref, readFeedShow } from '@/lib/social/feed-filter'

describe('readFeedShow', () => {
  it.each([
    ['results', 'results'],
    ['mine', 'mine'],
    ['all', 'all'],
    ['following', 'all'],
    ['', 'all'],
    [undefined, 'all'],
  ])('%j reads as %j', (raw, expected) => {
    expect(readFeedShow(raw)).toBe(expected)
  })

  it('reads the first of a repeated param', () => {
    expect(readFeedShow(['mine', 'results'])).toBe('mine')
  })
})

describe('feedShowHref', () => {
  it('links each tab without a cursor', () => {
    expect(feedShowHref('all')).toBe('/feed')
    expect(feedShowHref('results')).toBe('/feed?show=results')
    expect(feedShowHref('mine')).toBe('/feed?show=mine')
  })
})
