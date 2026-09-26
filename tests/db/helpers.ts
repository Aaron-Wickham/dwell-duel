import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  return createClient(url, key, { auth: { persistSession: false } })
}
