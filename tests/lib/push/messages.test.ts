import { describe, it, expect } from 'vitest'
import {
  marketResultPayload,
  newMarketPayload,
  resolveReminderPayload,
  taskReviewPayload,
  type MarketResultRow,
} from '@/lib/push/messages'

const resolved: MarketResultRow = {
  title: 'Will it rain?',
  status: 'resolved',
  outcomeLabel: 'No',
  isOverride: false,
  won: 0,
  refunded: 0,
  hasSolo: true,
}

const body = (row: Partial<MarketResultRow>) => marketResultPayload('m-1', { ...resolved, ...row }).body

describe('push payloads', () => {
  it('reminds a creator to resolve, linking to the market', () => {
    expect(resolveReminderPayload({ marketId: 'm-1', title: 'Will it rain?' })).toEqual({
      title: 'DwellDuel',
      body: 'Will it rain? has closed. Please resolve it.',
      url: '/markets/m-1',
    })
  })

  it('tells a winner what they won', () => {
    expect(marketResultPayload('m-1', { ...resolved, won: 26 })).toEqual({
      title: 'DwellDuel',
      body: 'You won 26 DC on Will it rain?',
      url: '/markets/m-1',
    })
  })

  it('gives a loser the result', () => {
    expect(body({})).toBe('Will it rain? resolved: No')
  })

  it('says a stake came back when nobody backed the winner', () => {
    expect(body({ refunded: 10 })).toBe('Will it rain? resolved: No, your stake is refunded')
  })

  it('only gives a parlay-only bettor the result, since the parlay settles later', () => {
    expect(body({ hasSolo: false, won: 0 })).toBe('Will it rain? resolved: No')
  })

  it('words an override as a change', () => {
    expect(body({ isOverride: true })).toBe('Will it rain? changed to No')
    expect(body({ isOverride: true, won: 26 })).toBe('Will it rain? changed to No. You won 26 DC')
    expect(body({ isOverride: true, refunded: 5 })).toBe('Will it rain? changed to No, your stake is refunded')
    expect(body({ isOverride: true, hasSolo: false })).toBe('Will it rain? changed to No')
  })

  it('tells solo bettors a void refunds them, and parlay holders the leg is dropped', () => {
    expect(body({ status: 'voided', outcomeLabel: null })).toBe('Will it rain? was voided, your stake is refunded')
    expect(body({ status: 'voided', outcomeLabel: null, hasSolo: false })).toBe('Will it rain? was voided and dropped from your parlay')
  })

  it('tells a submitter their task was approved, with the reward', () => {
    expect(taskReviewPayload({ taskTitle: 'Read Psalm 23', status: 'approved', rewardAmount: 10, reviewNote: null })).toEqual({
      title: 'DwellDuel',
      body: 'Your task “Read Psalm 23” was approved: +10 DC',
      url: '/tasks',
    })
  })

  it('gives the reason for a rejection, when there is one', () => {
    const rejected = { taskTitle: 'Read Psalm 23', status: 'rejected', rewardAmount: 10 }
    expect(taskReviewPayload({ ...rejected, reviewNote: 'No photo attached' }).body).toBe(
      'Your task “Read Psalm 23” was rejected: No photo attached',
    )
    expect(taskReviewPayload({ ...rejected, reviewNote: null }).body).toBe('Your task “Read Psalm 23” was rejected')
    expect(taskReviewPayload({ ...rejected, reviewNote: '  ' }).body).toBe('Your task “Read Psalm 23” was rejected')
  })

  it('announces a new market', () => {
    expect(newMarketPayload({ marketId: 'm-2', title: 'Sermon past noon?' })).toEqual({
      title: 'DwellDuel',
      body: 'New market: Sermon past noon?',
      url: '/markets/m-2',
    })
  })
})
