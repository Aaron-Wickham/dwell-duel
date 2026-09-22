'use server'

import { redirect } from 'next/navigation'
import { serverClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await serverClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
