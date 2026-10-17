import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-user'
import { isUuid } from '@/lib/uuid'

// Titles for the pages named after a row (#460). Each reads only the name, through the viewer's own
// client, so RLS still decides what they may see; anything missing falls back to the section's name.

export async function marketTitle(id: string): Promise<Metadata> {
  if (!isUuid(id)) return { title: 'Market' }
  const { supabase } = await requireUser()
  const { data } = await supabase.from('markets').select('title').eq('id', id).maybeSingle()
  return { title: data?.title ?? 'Market' }
}

export async function memberTitle(id: string, fallback = 'Member'): Promise<Metadata> {
  if (!isUuid(id)) return { title: fallback }
  const { supabase } = await requireUser()
  const { data } = await supabase.from('profiles').select('display_name').eq('id', id).maybeSingle()
  return { title: data?.display_name ?? fallback }
}
