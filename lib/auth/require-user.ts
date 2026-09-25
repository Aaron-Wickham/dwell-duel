import { cache } from 'react'
import { serverClient } from '@/lib/supabase/server'

export const requireUser = cache(async () => {
  const supabase = await serverClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
})
