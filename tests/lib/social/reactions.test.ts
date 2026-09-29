import { describe, it, expect, vi } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'
import { getReactions, isReactionKind, noReactions, reactionLabel, REACTIONS, toggleReaction } from '@/lib/social/reactions'

describe('REACTIONS', () => {
  it('holds the four reactions the owner chose, in order, matching the database check', () => {
    expect(REACTIONS.map((r) => [r.kind, r.emoji])).toEqual([
      ['fire', '🔥'],
      ['pray', '🙏'],
      ['laugh', '😂'],
      ['clap', '👏'],
    ])
    expect(isReactionKind('fire')).toBe(true)
    expect(isReactionKind('heart')).toBe(false)
    expect(isReactionKind(undefined)).toBe(false)
  })
})

describe('toggleReaction', () => {
  it('adds your reaction to the count', () => {
    const next = toggleReaction(noReactions(), 'fire', true)
    expect(next.fire).toEqual({ count: 1, mine: true })
    expect(next.pray).toEqual({ count: 0, mine: false })
  })

  it('takes your reaction back off the count', () => {
    const next = toggleReaction({ ...noReactions(), clap: { count: 3, mine: true } }, 'clap', false)
    expect(next.clap).toEqual({ count: 2, mine: false })
  })

  it('changes nothing when the reaction is already in the state asked for', () => {
    const reactions = { ...noReactions(), laugh: { count: 2, mine: true } }
    expect(toggleReaction(reactions, 'laugh', true)).toBe(reactions)
    expect(toggleReaction(noReactions(), 'laugh', false)).toEqual(noReactions())
  })
})

describe('reactionLabel', () => {
  it('names the reaction, the count and whether you reacted', () => {
    expect(reactionLabel('fire', { count: 3, mine: true })).toBe('React fire, 3 reactions, you reacted')
    expect(reactionLabel('pray', { count: 1, mine: false })).toBe('React pray, 1 reaction')
    expect(reactionLabel('clap', { count: 0, mine: false })).toBe('React clap, 0 reactions')
  })
})

describe('getReactions', () => {
  function client(rows: (ids: string[]) => { event_id: string; kind: string; reactions: number; mine: boolean }[]) {
    const rpc = vi.fn(async (_fn: string, args: { p_event_ids: string[] }) => ({ data: rows(args.p_event_ids), error: null }))
    return { supabase: { rpc } as unknown as DbClient, rpc }
  }

  it('reads nothing for no events', async () => {
    const { supabase, rpc } = client(() => [])
    expect(await getReactions(supabase, [])).toEqual(new Map())
    expect(rpc).not.toHaveBeenCalled()
  })

  it("groups the counts by event, with every kind present and mine marked", async () => {
    const { supabase, rpc } = client(() => [
      { event_id: 'bet:1', kind: 'fire', reactions: 3, mine: true },
      { event_id: 'bet:1', kind: 'clap', reactions: 1, mine: false },
      { event_id: 'bet:2', kind: 'pray', reactions: 2, mine: false },
    ])
    const reactions = await getReactions(supabase, ['bet:1', 'bet:2', 'bet:3'])

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('feed_reaction_counts', { p_event_ids: ['bet:1', 'bet:2', 'bet:3'] })
    expect(reactions.get('bet:1')).toEqual({ ...noReactions(), fire: { count: 3, mine: true }, clap: { count: 1, mine: false } })
    expect(reactions.get('bet:2')).toEqual({ ...noReactions(), pray: { count: 2, mine: false } })
    expect(reactions.has('bet:3')).toBe(false)
  })

  it('reads a long list of events in chunks of 50', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `bet:${i}`)
    const { supabase, rpc } = client((chunk) => chunk.map((id) => ({ event_id: id, kind: 'laugh', reactions: 1, mine: false })))
    const reactions = await getReactions(supabase, ids)

    expect(rpc.mock.calls.map(([, args]) => args.p_event_ids.length)).toEqual([50, 50, 20])
    expect(reactions.size).toBe(120)
  })

  it('throws a read error rather than showing no reactions', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('boom') }))
    await expect(getReactions({ rpc } as unknown as DbClient, ['bet:1'])).rejects.toThrow('boom')
  })
})
