import { describe, it, expect } from 'vitest'
import { countNoun, firstName, ridingText, standingLine, taskRewardsDetail } from '@/lib/home/copy'

describe('firstName', () => {
  it('greets by the first word of the display name, or the fallback', () => {
    expect(firstName('Ruth Newman')).toBe('Ruth')
    expect(firstName('  Ben  ')).toBe('Ben')
    expect(firstName('')).toBe('Member')
    expect(firstName(null)).toBe('Member')
  })
})

describe('ridingText', () => {
  it('says what is in open bets, or that nothing is', () => {
    expect(ridingText(275, 3)).toBe('275\u00A0DC in open bets')
    expect(ridingText(1250, 1)).toBe('1,250\u00A0DC in open bets')
    expect(ridingText(0, 0)).toBe('No open bets')
  })
})

describe('standingLine', () => {
  // C-8: "riding" is betting slang.
  it('gives rank, then the DC in how many open bets', () => {
    expect(standingLine({ rank: 218, memberCount: 502, riding: { dc: 275, wagers: 30 } })).toBe('218th of 502 · 275\u00A0DC in 30 open bets')
    expect(standingLine({ rank: 3, memberCount: 8, riding: { dc: 10, wagers: 1 } })).toBe('3rd of 8 · 10\u00A0DC in 1 open bet')
  })

  it('drops the rank until there is one, and says when nothing is open', () => {
    expect(standingLine({ rank: null, memberCount: 502, riding: { dc: 0, wagers: 0 } })).toBe('No open bets')
    expect(standingLine({ rank: 4, memberCount: 9, riding: { dc: 0, wagers: 0 } })).toBe('4th of 9 · No open bets')
  })

  // HOME-1: a failed at-stake read leaves the rank alone, or nothing.
  it('keeps the rank alone when what is at stake could not be read', () => {
    expect(standingLine({ rank: 4, memberCount: 9, riding: null })).toBe('4th of 9')
    expect(standingLine({ rank: null, memberCount: 9, riding: null })).toBe('')
  })
})

describe('countNoun', () => {
  it('handles one and many', () => {
    expect(countNoun(1, 'task submission', 'task submissions')).toBe('1 task submission')
    expect(countNoun(12, 'task submission', 'task submissions')).toBe('12 task submissions')
  })
})

describe('taskRewardsDetail', () => {
  it('gives the range of what tasks pay, a single amount, or nothing without tasks', () => {
    expect(taskRewardsDetail({ min: 5, max: 25 })).toBe('they pay 5 to 25\u00A0DC')
    expect(taskRewardsDetail({ min: 10, max: 10 })).toBe('they pay 10\u00A0DC each')
    expect(taskRewardsDetail(null)).toBeNull()
  })
})
