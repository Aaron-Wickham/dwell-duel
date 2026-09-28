'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'title' | 'description'; saved?: boolean } | undefined

// update_market (0043) decides who may edit and until when, and keeps the history.
export async function updateMarketAction(marketId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  // A textarea's newlines arrive as CRLF once the browser serialises the form, doubling up
  // against maxLength, which counts one character per line break.
  const description = String(formData.get('description') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.marketTitle) return { formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.marketDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' }
  }

  const { error } = await supabase.rpc('update_market', { p_market_id: marketId, p_title: title, p_description: description || null })
  if (error) return { formError: error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.' }

  revalidatePath('/', 'layout')
  return { saved: true }
}
