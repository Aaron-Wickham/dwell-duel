'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { RATE_LIMIT_ERRORS, TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { normalizeCategoryName } from './categories'

type Field = 'title' | 'description' | 'category'

export type ActionState = { formError?: string; field?: Field; saved?: boolean } | undefined

// update_market's raises (0043, 0046, 0103), the new-category write limit and the constraints its
// update can trip.
const UPDATE_MARKET_ERRORS: readonly KnownError<Field>[] = [
  { match: 'enter a title', formError: 'Enter a title.', field: 'title' },
  { match: 'choose a category', formError: 'Choose a category.', field: 'category' },
  { match: 'market not found', formError: 'This market no longer exists.' },
  { match: "only the market's creator or an admin can edit it", formError: 'Only the market’s creator or an admin can edit it.' },
  { match: "others have bet on this market, so its title can't change", formError: 'Others have bet on this market, so its title can’t change.', field: 'title' },
  { match: "this market has closed, so it can't be edited", formError: 'This market has closed, so it can’t be edited.' },
  { match: 'markets_title_length', formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' },
  { match: 'markets_description_length', formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' },
  { match: 'market_categories_name_length', formError: tooLong('Category', TEXT_LIMITS.category), field: 'category' },
  { ...RATE_LIMIT_ERRORS.category, field: 'category' },
]

// update_market (0043, 0103) decides who may edit what and until when, and keeps the history. A
// form with no title field changes only the category: an admin's, once the market has closed.
export async function updateMarketAction(marketId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const wording = formData.has('title')
  const title = String(formData.get('title') ?? '').trim()
  // A textarea's newlines arrive as CRLF once the browser serialises the form, doubling up
  // against maxLength, which counts one character per line break.
  const description = String(formData.get('description') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const category = normalizeCategoryName(String(formData.get('category') ?? ''))
  if (wording) {
    if (!title) return { formError: 'Enter a title.', field: 'title' }
    if (title.length > TEXT_LIMITS.marketTitle) return { formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' }
    if (description.length > TEXT_LIMITS.marketDescription) {
      return { formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' }
    }
  }
  if (!category) return { formError: 'Choose a category.', field: 'category' }
  if (category.length > TEXT_LIMITS.category) return { formError: tooLong('Category', TEXT_LIMITS.category), field: 'category' }

  // A null title keeps the wording as it is (0103).
  const { error } = await supabase.rpc('update_market', {
    p_market_id: marketId,
    p_title: wording ? title : null,
    p_description: wording ? description || null : null,
    p_category: category,
  })
  if (error) return friendlyError(error, UPDATE_MARKET_ERRORS, 'update_market failed')

  revalidatePath('/', 'layout')
  return { saved: true }
}
