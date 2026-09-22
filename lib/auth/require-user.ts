import { serverClient } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = await serverClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}
