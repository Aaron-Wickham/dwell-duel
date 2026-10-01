'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { RATE_LIMIT_ERRORS } from '@/lib/forms/limits'
import { isReactionKind } from './reactions'

export type ReactionResult = { error?: string }

// Adds or takes back one reaction. Idempotent both ways, so a double tap or a retry lands on the
// state the member last asked for.
export async function setReactionAction(eventId: string, kind: string, on: boolean): Promise<ReactionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Not signed in.' }
  if (!isReactionKind(kind) || typeof eventId !== 'string' || eventId.length === 0) return { error: 'That reaction isn’t available.' }

  if (on) {
    const { error } = await supabase.from('feed_reactions').insert({ event_id: eventId, profile_id: user.id, kind })
    // 23505: it's already there, which is what was asked for.
    if (error && error.code !== '23505') {
      if (error.message === RATE_LIMIT_ERRORS.reaction.match) return { error: RATE_LIMIT_ERRORS.reaction.formError }
      return { error: 'Couldn’t add your reaction. Try again.' }
    }
  } else {
    const { error } = await supabase.from('feed_reactions').delete().match({ event_id: eventId, profile_id: user.id, kind })
    if (error) return { error: 'Couldn’t remove your reaction. Try again.' }
  }

  // Re-renders the page in this action's response, so the optimistic view hands over to the real
  // counts without waiting for the live channel.
  refresh()
  return {}
}
