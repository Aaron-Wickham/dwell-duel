import { cache } from 'react'
import { serverClient } from '@/lib/supabase/server'
import { AuthUnavailableError, isAuthUnavailable } from '@/lib/auth/auth-unavailable'

export type SessionUser = { id: string; email?: string }

export const requireUser = cache(async (): Promise<{
  supabase: Awaited<ReturnType<typeof serverClient>>
  user: SessionUser | null
}> => {
  const supabase = await serverClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error) {
    if (isAuthUnavailable(error)) throw new AuthUnavailableError({ cause: error })
    return { supabase, user: null }
  }
  if (!data) return { supabase, user: null }
  return { supabase, user: { id: data.claims.sub, email: data.claims.email } }
})
