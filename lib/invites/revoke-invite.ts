import type { SupabaseClient } from '@supabase/supabase-js'

export interface RevokeInviteResult {
  ok: boolean
}

/** Only ever deletes an unclaimed invite — `.is('claimed_by', null)` makes
 * an attempt to revoke a claimed one a no-op rather than an error. */
export async function revokeInvite(supabase: SupabaseClient, email: string): Promise<RevokeInviteResult> {
  const { error } = await supabase
    .from('allowed_emails')
    .delete()
    .eq('email', email.trim().toLowerCase())
    .is('claimed_by', null)

  return { ok: !error }
}
