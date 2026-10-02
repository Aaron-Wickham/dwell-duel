import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { mergeCategoryAction, renameCategoryAction, setCategoryHiddenAction } from '@/lib/admin/category-actions'

const INTO = '3f0c1d52-6a52-4a0e-9a0b-0c5f3a9a4b11'
const form = (entries: Record<string, string>) => {
  const data = new FormData()
  for (const [k, v] of Object.entries(entries)) data.set(k, v)
  return data
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: null, error: null })
  revalidatePath.mockReset()
})

describe('category admin actions (#327)', () => {
  it('renames with the name tidied, refusing a blank or too-long one without calling the database', async () => {
    expect(await renameCategoryAction('c1', undefined, form({ name: '  Bible   study ' }))).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('rename_market_category', { p_category_id: 'c1', p_name: 'Bible study' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')

    supabase.rpc.mockClear()
    expect(await renameCategoryAction('c1', undefined, form({ name: ' ' }))).toEqual({ formError: 'Enter a name.' })
    expect(await renameCategoryAction('c1', undefined, form({ name: 'n'.repeat(25) }))).toEqual({
      formError: 'A name can be at most 24 characters.',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('words a rename the database refuses', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'a category with that name already exists; merge them instead' } })
    expect(await renameCategoryAction('c1', undefined, form({ name: 'Sports' }))).toEqual({
      formError: 'A category with that name already exists. Merge them instead.',
    })
  })

  it('merges into the chosen category, and needs one', async () => {
    expect(await mergeCategoryAction('c1', undefined, form({ into: INTO }))).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('merge_market_categories', { p_from: 'c1', p_into: INTO })
    supabase.rpc.mockClear()
    expect(await mergeCategoryAction('c1', undefined, form({ into: 'nope' }))).toEqual({ formError: 'Choose a category to merge into.' })
    expect(supabase.rpc).not.toHaveBeenCalled()

    supabase.rpc.mockResolvedValue({ data: null, error: { message: "Other can't be merged away" } })
    expect(await mergeCategoryAction('c1', undefined, form({ into: INTO }))).toEqual({ formError: 'Other can’t be merged away.' })
  })

  it('hides and unhides', async () => {
    expect(await setCategoryHiddenAction('c1', true, undefined, new FormData())).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('set_market_category_hidden', { p_category_id: 'c1', p_hidden: true })
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'only an admin can change categories' } })
    expect(await setCategoryHiddenAction('c1', false, undefined, new FormData())).toEqual({ formError: 'Only an admin can change categories.' })
  })
})
