import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export const isAdmin = cache(async (supabase: SupabaseClient): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return data === true
})
