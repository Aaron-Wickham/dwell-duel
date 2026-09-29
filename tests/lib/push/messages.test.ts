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

const result = (row: Partial<MarketResultRow>) => {
  const { title, body } = marketResultPayload('m-1', { ...resolved, ...row })
  return { title, body }
}

describe('push payloads', () => {
  it('reminds a creator to resolve, linking to the market', () => {
    expect(resolveReminderPayload({ marketId: 'm-1', title: 'Will it rain?' })).toEqual({
      title: 'Time to resolve',
      body: 'Will it rain? has closed',
      url: '/markets/m-1',
    })
  })

  it('tells a winner what they won in the title', () => {
    expect(marketResultPayload('m-1', { ...resolved, won: 26 })).toEqual({
      title: 'You won 26 DC',
      body: 'Will it rain?: No',
      url: '/markets/m-1',
    })
  })

  it('gives a loser the result', () => {
    expect(result({})).toEqual({ title: 'Market resolved', body: 'Will it rain?: No' })
  })

  it('says a stake came back when nobody backed the winner', () => {
    expect(result({ refunded: 10 })).toEqual({ title: 'Market resolved', body: 'Will it rain?: No. Your stake is refunded' })
  })

  it('only gives a parlay-only bettor the result, since the parlay settles later', () => {
    expect(result({ hasSolo: false, won: 0 })).toEqual({ title: 'Market resolved', body: 'Will it rain?: No' })
    expect(result({ hasSolo: false, won: 26 })).toEqual({ title: 'Market resolved', body: 'Will it rain?: No' })
  })

  it('words an override as a change', () => {
    expect(result({ isOverride: true })).toEqual({ title: 'Result changed', body: 'Will it rain? changed to No' })
    expect(result({ isOverride: true, won: 26 })).toEqual({ title: 'You won 26 DC', body: 'Will it rain? changed to No' })
    expect(result({ isOverride: true, refunded: 5 })).toEqual({
      title: 'Result changed',
      body: 'Will it rain? changed to No. Your stake is refunded',
    })
    expect(result({ isOverride: true, hasSolo: false })).toEqual({ title: 'Result changed', body: 'Will it rain? changed to No' })
  })

  it('tells solo bettors a void refunds them, and parlay holders the leg is dropped', () => {
    expect(result({ status: 'voided', outcomeLabel: null })).toEqual({
      title: 'Market voided',
      body: 'Will it rain?: your stake is refunded',
    })
    expect(result({ status: 'voided', outcomeLabel: null, hasSolo: false })).toEqual({
      title: 'Market voided',
      body: 'Will it rain? was dropped from your parlay',
    })
  })

  it('tells a submitter their task was approved, with the reward', () => {
    expect(taskReviewPayload({ taskTitle: 'Read Psalm 23', status: 'approved', rewardAmount: 10, reviewNote: null })).toEqual({
      title: 'Task approved',
      body: 'Read Psalm 23: +10 DC',
      url: '/tasks',
    })
  })

  it('gives the reason for a rejection, when there is one', () => {
    const rejected = { taskTitle: 'Read Psalm 23', status: 'rejected', rewardAmount: 10 }
    expect(taskReviewPayload({ ...rejected, reviewNote: 'No photo attached' })).toEqual({
      title: 'Task not approved',
      body: 'Read Psalm 23: No photo attached',
      url: '/tasks',
    })
    expect(taskReviewPayload({ ...rejected, reviewNote: null }).body).toBe('Read Psalm 23')
    expect(taskReviewPayload({ ...rejected, reviewNote: '  ' }).body).toBe('Read Psalm 23')
  })

  it('announces a new market', () => {
    expect(newMarketPayload({ marketId: 'm-2', title: 'Sermon past noon?' })).toEqual({
      title: 'New market',
      body: 'Sermon past noon?',
      url: '/markets/m-2',
    })
  })

  it('never titles a notification with the app name, which the OS already shows', () => {
    const titles = [
      resolveReminderPayload({ marketId: 'm', title: 't' }).title,
      newMarketPayload({ marketId: 'm', title: 't' }).title,
      taskReviewPayload({ taskTitle: 't', status: 'approved', rewardAmount: 1, reviewNote: null }).title,
      taskReviewPayload({ taskTitle: 't', status: 'rejected', rewardAmount: 1, reviewNote: null }).title,
      ...[{}, { won: 1 }, { refunded: 1 }, { status: 'voided' }, { isOverride: true }].map((r) => result(r).title),
    ]
    expect(titles).not.toContain('DwellDuel')
  })
})
