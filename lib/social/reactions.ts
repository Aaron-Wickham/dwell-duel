import type { DbClient } from '@/lib/supabase/database'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'

// The four reactions the owner chose (#79), in the order they show. feed_reactions' kind check
// (0053) allows exactly these.
export const REACTIONS = [
  { kind: 'fire', emoji: '🔥', name: 'fire' },
  { kind: 'pray', emoji: '🙏', name: 'pray' },
  { kind: 'laugh', emoji: '😂', name: 'laugh' },
  { kind: 'clap', emoji: '👏', name: 'clap' },
] as const

export type ReactionKind = (typeof REACTIONS)[number]['kind']

export type ReactionCount = { count: number; mine: boolean }
export type EventReactions = Record<ReactionKind, ReactionCount>

const KINDS = new Set<string>(REACTIONS.map((r) => r.kind))

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === 'string' && KINDS.has(value)
}

export function noReactions(): EventReactions {
  return { fire: { count: 0, mine: false }, pray: { count: 0, mine: false }, laugh: { count: 0, mine: false }, clap: { count: 0, mine: false } }
}

// What a toggle does to one event's reactions, for the optimistic view.
export function toggleReaction(reactions: EventReactions, kind: ReactionKind, on: boolean): EventReactions {
  const current = reactions[kind]
  if (current.mine === on) return reactions
  return { ...reactions, [kind]: { count: Math.max(0, current.count + (on ? 1 : -1)), mine: on } }
}

// "React fire, 3 reactions, you reacted". The emoji stays out of the name: a screen reader would
// read its own name for it ("folded hands") beside ours.
export function reactionLabel(name: string, { count, mine }: ReactionCount): string {
  const counted = `${count} ${count === 1 ? 'reaction' : 'reactions'}`
  return `React ${name}, ${counted}${mine ? ', you reacted' : ''}`
}

// One page of feed items' reactions. feed_reaction_counts returns at most one row per event and
// kind, so a 50-id chunk stays well under PostgREST's 1000-row cap however many members react.
export async function getReactions(supabase: DbClient, eventIds: string[]): Promise<Map<string, EventReactions>> {
  const byEvent = new Map<string, EventReactions>()
  if (eventIds.length === 0) return byEvent
  const results = await Promise.all(
    chunk([...new Set(eventIds)], IN_CHUNK).map((ids) => supabase.rpc('feed_reaction_counts', { p_event_ids: ids })),
  )
  for (const { data, error } of results) {
    if (error) throw error
    for (const row of data ?? []) {
      if (!isReactionKind(row.kind)) continue
      let reactions = byEvent.get(row.event_id)
      if (!reactions) byEvent.set(row.event_id, (reactions = noReactions()))
      reactions[row.kind] = { count: row.reactions, mine: row.mine }
    }
  }
  return byEvent
}
