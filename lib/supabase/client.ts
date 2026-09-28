import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/database'
import { fetchWithTimeout, BROWSER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

export function browserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { fetch: fetchWithTimeout(BROWSER_FETCH_TIMEOUT_MS) } },
  )
}
