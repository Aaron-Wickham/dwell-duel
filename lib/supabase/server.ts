import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * `cache()`-wrapped so every Server Component/Action in a single request
 * that calls this shares one client instance instead of each constructing
 * its own. Safe across requests, not just within one: `cache()` here is
 * React's Server Components primitive, which Next.js resets per incoming
 * request -- it is not a module-level singleton that would persist across
 * requests on a warm serverless instance.
 */
export const serverClient = cache(async () => {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Called from a Server Component; middleware refreshes the session instead.
          }
        },
      },
    },
  )
})
