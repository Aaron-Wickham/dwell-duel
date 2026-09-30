import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { pgQuery } from './pg-query'

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
 * Wipes every table the suite touches and every auth user, in one round trip through
 * postgres-meta (pgQuery refuses anything but localhost). Every DB test file starts this way,
 * and going table by table through PostgREST and then user by user through Auth's admin API
 * was most of the suite's time (#214). Deleting from auth.users takes identities, sessions and
 * tokens with it through Auth's own foreign keys, the same rows the admin API deletes.
 */
export async function wipeDatabase(): Promise<void> {
  await pgQuery(`
    delete from public.parlays;
    delete from public.task_completions;
    delete from public.tasks;
    delete from public.markets;
    delete from public.coin_transactions;
    delete from public.allowed_emails;
    delete from public.profiles;
    delete from auth.users;
  `)
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
