'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'title' | 'description'; saved?: boolean } | undefined

// update_market's raises (0043, 0046) and the constraints its update can trip.
const UPDATE_MARKET_ERRORS: readonly KnownError<'title' | 'description'>[] = [
  { match: 'enter a title', formError: 'Enter a title.', field: 'title' },
  { match: 'market not found', formError: 'This market no longer exists.' },
  { match: "only the market's creator or an admin can edit it", formError: 'Only the market’s creator or an admin can edit it.' },
  { match: "others have bet on this market, so its title can't change", formError: 'Others have bet on this market, so its title can’t change.', field: 'title' },
  { match: "this market has closed, so it can't be edited", formError: 'This market has closed, so it can’t be edited.' },
  { match: 'markets_title_length', formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' },
  { match: 'markets_description_length', formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' },
]

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
  if (error) return friendlyError(error, UPDATE_MARKET_ERRORS, 'update_market failed')

  revalidatePath('/', 'layout')
  return { saved: true }
}
