import type { DbClient } from '@/lib/supabase/database'
import { reportError } from '@/lib/observability/report'

/**
 * Deletes auth users who finished Google sign-in but were never invited (#275): a day old or more,
 * with no profile, invite or ledger row (uninvited_auth_users, 0079 — it never lists a member,
 * removed members included). Through the Auth admin API, which clears their sessions and
 * identities too. `db` must be the service-role client.
 *
 * A delete that fails is reported and skipped, never thrown: the list is oldest first, so one
 * account Auth refuses to delete would otherwise fail the cron every day, even alone. Only a
 * failure to list throws.
 */
export async function pruneUninvitedUsers(db: DbClient, limit = 100): Promise<{ removed: number; failed: number }> {
  const { data, error } = await db.rpc('uninvited_auth_users', { p_limit: limit })
  if (error) throw error

  let removed = 0
  let failed = 0
  for (const { id } of data ?? []) {
    const { error: deleteError } = await db.auth.admin.deleteUser(id)
    if (deleteError) {
      failed++
      reportError('keep-alive: deleting an uninvited sign-in failed', deleteError)
    } else removed++
  }
  return { removed, failed }
}
