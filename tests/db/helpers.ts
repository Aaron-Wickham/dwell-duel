import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

export function assertLocal(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`)
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run the DB test suite against ${host}. This suite is DESTRUCTIVE — ` +
        'it deletes every auth user, profile, invite and coin transaction — so it only runs ' +
        `against a local Supabase instance (${[...LOCAL_HOSTS].join(' or ')}). Point ` +
        'NEXT_PUBLIC_SUPABASE_URL in .env.local back at your local stack before testing.',
    )
  }
}

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Deletes every auth user, a page at a time. `listUsers()` returns only the first page of 50, so
 * a suite that adds more than that and is killed before its own cleanup would otherwise leave the
 * rest behind for the next file's own delete-everything setup to trip over. Deleting shifts the
 * pages, so re-listing after each batch is always page 1 again.
 */
export async function deleteAllAuthUsers(db: SupabaseClient): Promise<void> {
  // Bounded so a delete that reports success without taking effect fails loudly instead of spinning.
  for (let pass = 0; pass < 100; pass++) {
    const { data, error } = await db.auth.admin.listUsers()
    if (error) throw error
    if (data.users.length === 0) return
    for (const u of data.users) await deleteAuthUser(db, u.id)
  }
  throw new Error('deleteAllAuthUsers: auth users remain after 100 passes')
}

// Local Auth's admin API occasionally answers a delete with a retryable "Database error deleting
// user" under the suite's sustained load; it succeeds when asked again.
export async function deleteAuthUser(db: SupabaseClient, id: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { error } = await db.auth.admin.deleteUser(id)
    if (!error) return
    if (!isAuthRetryableFetchError(error) || attempt === 3) throw error
    await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
  }
}
