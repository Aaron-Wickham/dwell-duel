'use server'

import { redirect } from 'next/navigation'
import { serverClient } from '@/lib/supabase/server'

// Only this device: the default scope is 'global', which would revoke every device's session (#194).
export async function signOut() {
  const supabase = await serverClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/sign-in')
}
