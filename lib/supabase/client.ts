import { createBrowserClient } from '@supabase/ssr'
import { fetchWithTimeout, BROWSER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithTimeout(BROWSER_FETCH_TIMEOUT_MS) } },
  )
}
