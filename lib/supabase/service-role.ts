import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Bypasses RLS entirely. Only for server-side code with no Supabase
 * session to bind a normal client to (e.g. cron routes). Never construct
 * this in code reachable from a request without an equivalent narrow,
 * already-verified authorization check happening first.
 */
export function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'serviceRoleClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
