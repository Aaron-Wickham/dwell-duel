import type { DbClient } from '@/lib/supabase/database'

/**
 * Deletes auth users who finished Google sign-in but were never invited (#275): a day old or more,
 * with no profile, invite or ledger row (uninvited_auth_users, 0079 — it never lists a member,
 * removed members included). Through the Auth admin API, which clears their sessions and
 * identities too. `db` must be the service-role client. Returns how many went; a failed delete
 * doesn't stop the rest, and is thrown once they've all been tried.
 */
export async function pruneUninvitedUsers(db: DbClient, limit = 100): Promise<number> {
  const { data, error } = await db.rpc('uninvited_auth_users', { p_limit: limit })
  if (error) throw error

  let removed = 0
  let failure: unknown = null
  for (const { id } of data ?? []) {
    const { error: deleteError } = await db.auth.admin.deleteUser(id)
    if (deleteError) failure ??= deleteError
    else removed++
  }
  if (failure) throw failure
  return removed
}
