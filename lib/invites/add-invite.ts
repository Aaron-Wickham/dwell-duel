import type { SupabaseClient } from '@supabase/supabase-js'

export interface AddInviteResult {
  ok: boolean
  formError?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Inserts a new row into allowed_emails using the caller's own session's
 * Supabase client, so admin_insert_invites's is_admin() RLS check
 * actually runs. `invitedBy` must come from the caller's own verified
 * session — never from client-supplied input.
 */
export async function addInvite(
  supabase: SupabaseClient,
  invitedBy: string,
  rawEmail: string,
): Promise<AddInviteResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, formError: 'Enter a valid email address.' }
  }

  const { error } = await supabase.from('allowed_emails').insert({ email, invited_by: invitedBy })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, formError: 'That email is already invited.' }
    }
    return { ok: false, formError: 'Could not add that invite.' }
  }

  return { ok: true }
}
