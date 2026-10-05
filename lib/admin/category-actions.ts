'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError, SIGNED_OUT_ERROR } from '@/lib/errors/friendly-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { normalizeCategoryName } from '@/lib/markets/categories'
import { isUuid } from '@/lib/uuid'

export type CategoryActionState = { formError?: string; saved?: boolean } | undefined

// The raises of rename_market_category, merge_market_categories and set_market_category_hidden
// (0103), and the constraint a rename can trip.
const CATEGORY_ERRORS: readonly KnownError<never>[] = [
  { match: 'only an admin can change categories', formError: 'Only an admin can change categories.' },
  { match: 'category not found', formError: 'This category no longer exists.' },
  { match: 'enter a name', formError: 'Enter a name.' },
  {
    match: 'a category with that name already exists; merge them instead',
    formError: 'A category with that name already exists. Merge them instead.',
  },
  { match: 'choose a different category to merge into', formError: 'Choose a different category to merge into.' },
  { match: "Other can't be merged away", formError: 'Other can’t be merged away.' },
  { match: "merge into a category that isn't hidden", formError: 'Merge into a category that isn’t hidden.' },
  { match: "Other can't be hidden", formError: 'Other can’t be hidden.' },
  { match: 'market_categories_name_length', formError: tooLong('A name', TEXT_LIMITS.category) },
  { match: 'market_categories_slug_key', formError: 'A category with that name already exists. Merge them instead.' },
]

// Each RPC checks the caller is an admin itself; these only pass the request on and word the answer.
export async function renameCategoryAction(categoryId: string, _prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const name = normalizeCategoryName(String(formData.get('name') ?? ''))
  if (!name) return { formError: 'Enter a name.' }
  if (name.length > TEXT_LIMITS.category) return { formError: tooLong('A name', TEXT_LIMITS.category) }
  const { supabase, user } = await requireUser()
  if (!user) return { formError: SIGNED_OUT_ERROR }
  const { error } = await supabase.rpc('rename_market_category', { p_category_id: categoryId, p_name: name })
  if (error) return friendlyError(error, CATEGORY_ERRORS, 'rename_market_category failed')
  revalidatePath('/', 'layout')
  return { saved: true }
}

export async function mergeCategoryAction(categoryId: string, _prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const into = String(formData.get('into') ?? '')
  if (!isUuid(into)) return { formError: 'Choose a category to merge into.' }
  const { supabase, user } = await requireUser()
  if (!user) return { formError: SIGNED_OUT_ERROR }
  const { error } = await supabase.rpc('merge_market_categories', { p_from: categoryId, p_into: into })
  if (error) return friendlyError(error, CATEGORY_ERRORS, 'merge_market_categories failed')
  revalidatePath('/', 'layout')
  return { saved: true }
}

export async function setCategoryHiddenAction(
  categoryId: string,
  hidden: boolean,
  _prev: CategoryActionState,
  _formData: FormData,
): Promise<CategoryActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: SIGNED_OUT_ERROR }
  const { error } = await supabase.rpc('set_market_category_hidden', { p_category_id: categoryId, p_hidden: hidden })
  if (error) return friendlyError(error, CATEGORY_ERRORS, 'set_market_category_hidden failed')
  revalidatePath('/', 'layout')
  return { saved: true }
}
