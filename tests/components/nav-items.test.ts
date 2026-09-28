import { describe, it, expect } from 'vitest'
import { activeNavId, NAV_ITEMS } from '@/components/app-nav/nav-items'

describe('activeNavId', () => {
  it('matches home exactly', () => {
    expect(activeNavId('/')).toBe('home')
  })

  it('matches each section and anything beneath it', () => {
    expect(activeNavId('/markets')).toBe('markets')
    expect(activeNavId('/markets/new')).toBe('markets')
    expect(activeNavId('/markets/3f2a')).toBe('markets')
    expect(activeNavId('/bets')).toBe('bets')
    expect(activeNavId('/parlays')).toBe('parlays')
    expect(activeNavId('/tasks')).toBe('tasks')
    expect(activeNavId('/feed')).toBe('feed')
    expect(activeNavId('/leaderboard')).toBe('leaderboard')
    expect(activeNavId('/admin/ledger')).toBe('admin')
  })

  it('treats a member profile as part of the leaderboard', () => {
    expect(activeNavId('/members/3f2a')).toBe('leaderboard')
  })

  it('matches nothing for other paths', () => {
    expect(activeNavId('/sign-in')).toBeNull()
    expect(activeNavId('/marketsx')).toBeNull()
  })
})

describe('NAV_ITEMS', () => {
  it('lists the seven destinations in order, with the short Leaderboard label', () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.shortLabel, i.href])).toEqual([
      ['Home', 'Home', '/'],
      ['Markets', 'Markets', '/markets'],
      ['My bets', 'Bets', '/bets'],
      ['Parlays', 'Parlays', '/parlays'],
      ['Tasks', 'Tasks', '/tasks'],
      ['Feed', 'Feed', '/feed'],
      ['Leaderboard', 'Leaders', '/leaderboard'],
    ])
  })
})
