import { describe, it, expect } from 'vitest'
import { activeNavId, NAV_ITEMS } from '@/components/app-nav/nav-items'

describe('activeNavId', () => {
  it('matches Home on Home and on Activity, which opens from it', () => {
    expect(activeNavId('/')).toBe('home')
    expect(activeNavId('/feed')).toBe('home')
  })

  it('matches each section and anything beneath it', () => {
    expect(activeNavId('/markets')).toBe('markets')
    expect(activeNavId('/markets/new')).toBe('markets')
    expect(activeNavId('/markets/3f2a')).toBe('markets')
    expect(activeNavId('/bets')).toBe('bets')
    expect(activeNavId('/tasks')).toBe('tasks')
    expect(activeNavId('/leaderboard')).toBe('leaderboard')
  })

  it('treats a member profile as part of the leaderboard', () => {
    expect(activeNavId('/members/3f2a')).toBe('leaderboard')
  })

  it('matches nothing for other paths', () => {
    expect(activeNavId('/sign-in')).toBeNull()
    expect(activeNavId('/marketsx')).toBeNull()
    expect(activeNavId('/settings')).toBeNull()
    // Admin has no tab (#385): it opens from Home's Needs you and the avatar menu.
    expect(activeNavId('/admin/ledger')).toBeNull()
  })
})

describe('NAV_ITEMS', () => {
  it('lists the five destinations in order, with the short Leaderboard label', () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.shortLabel, i.href])).toEqual([
      ['Home', 'Home', '/'],
      ['Markets', 'Markets', '/markets'],
      ['My bets', 'Bets', '/bets'],
      ['Tasks', 'Tasks', '/tasks'],
      ['Leaderboard', 'Leaders', '/leaderboard'],
    ])
  })
})
