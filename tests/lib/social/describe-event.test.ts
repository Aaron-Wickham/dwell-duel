import { describe, it, expect } from 'vitest'
import { describeEvent, type FeedEvent } from '@/lib/social/describe-event'

const base: FeedEvent = {
  id: 'x',
  kind: 'bet_placed',
  occurredAt: '2026-09-25T12:00:00Z',
  actorId: 'u1',
  actorName: 'Sarah',
  marketId: 'm1',
  marketTitle: 'Will it rain?',
  outcomeLabel: 'Yes',
  amount: 20,
  legCount: null,
  taskTitle: null,
  resolutionNote: null,
}
const sarah = { text: 'Sarah', href: '/members/u1' }
const market = { text: 'Will it rain?', href: '/markets/m1' }

describe('describeEvent', () => {
  it('describes a placed bet', () => {
    expect(describeEvent(base)).toEqual([sarah, ' bet 20 DC on Yes in ', market])
  })

  it('describes a placed parlay', () => {
    expect(describeEvent({ ...base, kind: 'parlay_placed', marketId: null, marketTitle: null, outcomeLabel: null, amount: 10, legCount: 3 })).toEqual([
      sarah,
      ' placed a 3-pick parlay for 10 DC',
    ])
  })

  it('describes a created market', () => {
    expect(describeEvent({ ...base, kind: 'market_created', outcomeLabel: null, amount: null })).toEqual([sarah, ' opened ', market])
  })

  it('describes a resolved market', () => {
    expect(describeEvent({ ...base, kind: 'market_resolved', amount: null })).toEqual([market, ' resolved: Yes'])
  })

  it('describes a bet win', () => {
    expect(describeEvent({ ...base, kind: 'bet_won', amount: 45 })).toEqual([sarah, ' won 45 DC on ', market])
  })

  it('describes a parlay win', () => {
    expect(describeEvent({ ...base, kind: 'parlay_won', marketId: null, marketTitle: null, outcomeLabel: null, amount: 160, legCount: 3 })).toEqual([
      sarah,
      "'s 3-pick parlay paid 160 DC",
    ])
  })

  it('describes an approved task completion', () => {
    expect(
      describeEvent({ ...base, kind: 'task_completed', marketId: null, marketTitle: null, outcomeLabel: null, amount: 10, taskTitle: 'Read Genesis 1-3' }),
    ).toEqual([sarah, ' completed Read Genesis 1-3 (+10 DC)'])
  })
})
