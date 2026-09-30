import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database'
import { fetchWithTimeout, SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

/**
 * Bypasses RLS entirely. Only for server-side code with no Supabase
 * session to bind a normal client to (e.g. cron routes). Never construct
 * this in code reachable from a request without an equivalent narrow,
 * already-verified authorization check happening first.
 */
export function serviceRoleClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error(
      'serviceRoleClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY',
    )
  }
  // The same bound the request-time clients have: a cron route waiting on a hung Supabase
  // connection would otherwise run until Vercel killed it.
  return createClient<Database>(url, key, { auth: { persistSession: false }, global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) } })
}
