import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export const isAdmin = cache(async (supabase: SupabaseClient): Promise<boolean> => {
  const { data } = await supabase.rpc('is_admin')
  return data === true
})
