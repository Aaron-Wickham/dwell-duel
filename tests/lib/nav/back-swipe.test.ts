import { describe, it, expect } from 'vitest'
import { BACK_SWIPE_EDGE, BACK_SWIPE_SLOP, backSwipeDecision, logicalParent } from '@/lib/nav/back-swipe'

const width = 375

describe('backSwipeDecision', () => {
  it('ignores a drag that is more vertical than horizontal, whatever its distance or speed', () => {
    expect(backSwipeDecision({ dx: 10, dy: 11, width, velocity: 0 })).toBe('ignore')
    expect(backSwipeDecision({ dx: 200, dy: -201, width, velocity: 2 })).toBe('ignore')
    expect(backSwipeDecision({ dx: -5, dy: 30, width, velocity: 0 })).toBe('ignore')
  })

  it('treats an exact diagonal as horizontal', () => {
    expect(backSwipeDecision({ dx: 40, dy: 40, width, velocity: 0 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 125, dy: -125, width, velocity: 0 })).toBe('complete')
  })

  it('completes once the drag reaches a third of the width', () => {
    expect(backSwipeDecision({ dx: 124.9, dy: 0, width, velocity: 0 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 125, dy: 0, width, velocity: 0 })).toBe('complete')
    expect(backSwipeDecision({ dx: 300, dy: 20, width, velocity: 0 })).toBe('complete')
  })

  it('scales the distance threshold with the width', () => {
    expect(backSwipeDecision({ dx: 200, dy: 0, width: 1024, velocity: 0 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 342, dy: 0, width: 1024, velocity: 0 })).toBe('complete')
  })

  it('completes a short drag that ends in a rightward flick faster than 0.5 px/ms', () => {
    expect(backSwipeDecision({ dx: 30, dy: 2, width, velocity: 0.5 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 30, dy: 2, width, velocity: 0.51 })).toBe('complete')
    expect(backSwipeDecision({ dx: 30, dy: 2, width, velocity: 3 })).toBe('complete')
  })

  it('cancels a short, slow drag, and a flick back towards the edge', () => {
    expect(backSwipeDecision({ dx: 60, dy: 5, width, velocity: 0.2 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 60, dy: 5, width, velocity: -1 })).toBe('cancel')
  })

  it('never completes a drag that ends left of where it started', () => {
    expect(backSwipeDecision({ dx: -40, dy: 0, width, velocity: 1 })).toBe('cancel')
    expect(backSwipeDecision({ dx: 0, dy: 0, width, velocity: 1 })).toBe('cancel')
  })

  it('cancels when the finger has not moved', () => {
    expect(backSwipeDecision({ dx: 0, dy: 0, width, velocity: 0 })).toBe('cancel')
  })

  it('keeps the edge zone and direction slop small', () => {
    expect(BACK_SWIPE_EDGE).toBe(20)
    expect(BACK_SWIPE_SLOP).toBeLessThan(10)
  })
})

describe('logicalParent', () => {
  it.each([
    ['/markets/3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f', '/markets'],
    ['/markets/new', '/markets'],
    ['/members/3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f', '/leaderboard'],
    ['/parlays/3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f', '/bets'],
    // Activity (D1) is a drill-down from Home.
    ['/feed', '/'],
    ['/admin/invites', '/'],
    ['/admin/tasks', '/'],
    ['/admin/members', '/'],
    ['/admin/members/3f2a0c1e-8d8b-4c43-9f0f-0a7c5b1d2e3f', '/admin/members'],
    ['/admin/ledger', '/'],
    ['/markets', '/'],
    ['/leaderboard', '/'],
    ['/members', '/'],
    ['/parlays', '/'],
    ['/', '/'],
    ['', '/'],
  ])('%s goes up to %s', (pathname, parent) => {
    expect(logicalParent(pathname)).toBe(parent)
  })
})
