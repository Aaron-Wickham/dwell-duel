import type { DbClient } from '@/lib/supabase/database'
import { TEXT_LIMITS } from '@/lib/forms/limits'

export type CreateOwnProfileResult = { ok: true } | { ok: false; reason: 'not_invited' | 'error' }

/**
 * Inserts the caller's own profile row using their own session's Supabase
 * client, so insert_own_profile's is_invited() RLS check actually runs.
 * `supabase` must be a client bound to the calling user's own session;
 * `userId`/`email` must come from that same session — never from
 * client-suppliable input.
 */
export async function createOwnProfile(
  supabase: DbClient,
  userId: string,
  email: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<CreateOwnProfileResult> {
  // A Google name can be longer than profiles_display_name_length allows; sign-up must not fail on it.
  // Cut by code point, which is what char_length counts, so no emoji is split in half.
  const name = Array.from(displayName).slice(0, TEXT_LIMITS.displayName).join('')
  const { error } = await supabase
    .from('profiles')
    .insert({ id: userId, email, display_name: name, avatar_url: avatarUrl })

  if (!error) return { ok: true }

  // 23505 = unique_violation on the primary key: a profile already exists
  // for this id (a returning user) — expected, not a failure.
  if (error.code === '23505') return { ok: true }

  // 42501 = insufficient_privilege: either insert_own_profile's RLS check
  // rejected the row (is_invited() was false) or the column-restricted
  // grant rejected an attempted column — this function never sends
  // balance/is_admin, so in practice this means "not invited."
  if (error.code === '42501') return { ok: false, reason: 'not_invited' }

  return { ok: false, reason: 'error' }
}
