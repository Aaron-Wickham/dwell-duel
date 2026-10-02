import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { updateMarketAction } from '@/lib/markets/update-market'

function form(title: string, description = '', category = 'Weather') {
  const data = new FormData()
  data.set('title', title)
  data.set('description', description)
  data.set('category', category)
  return data
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: null, error: null })
  revalidatePath.mockReset()
})

describe('updateMarketAction', () => {
  it('sends the trimmed title and description, and refreshes every page', async () => {
    expect(await updateMarketAction('m1', undefined, form('  Will it snow Sunday?  ', ' Before noon \r\n'))).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('update_market', { p_market_id: 'm1', p_title: 'Will it snow Sunday?', p_description: 'Before noon', p_category: 'Weather' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('refuses a blank or too-long title and a too-long description without calling the database', async () => {
    expect(await updateMarketAction('m1', undefined, form('   '))).toEqual({ formError: 'Enter a title.', field: 'title' })
    expect(await updateMarketAction('m1', undefined, form('a'.repeat(121)))).toEqual({
      formError: 'Title can be at most 120 characters.',
      field: 'title',
    })
    expect(await updateMarketAction('m1', undefined, form('Fine', 'a'.repeat(1001)))).toEqual({
      formError: 'Description can be at most 1000 characters.',
      field: 'description',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('changes only the category when the form has no title field (#327)', async () => {
    const data = new FormData()
    data.set('category', '  Bible   study ')
    expect(await updateMarketAction('m1', undefined, data)).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('update_market', { p_market_id: 'm1', p_title: null, p_description: null, p_category: 'Bible study' })
  })

  it('sends a new close time when the form has one, and only the close time from a reopen form (#326)', async () => {
    const later = new Date(Date.now() + 3_600_000).toISOString()
    const data = form('Same', '', 'Weather')
    data.set('close_at', later)
    expect(await updateMarketAction('m1', undefined, data)).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenCalledWith('update_market', {
      p_market_id: 'm1',
      p_title: 'Same',
      p_description: null,
      p_category: 'Weather',
      p_close_at: later,
    })

    const reopen = new FormData()
    reopen.set('close_at', later)
    expect(await updateMarketAction('m1', undefined, reopen)).toEqual({ saved: true })
    expect(supabase.rpc).toHaveBeenLastCalledWith('update_market', {
      p_market_id: 'm1',
      p_title: null,
      p_description: null,
      p_category: null,
      p_close_at: later,
    })
  })

  it('refuses a missing or past close time without calling the database', async () => {
    for (const value of ['', 'not a date', new Date(Date.now() - 60_000).toISOString()]) {
      const data = new FormData()
      data.set('close_at', value)
      expect(await updateMarketAction('m1', undefined, data)).toEqual({ formError: 'Choose a close time in the future.', field: 'close_at' })
    }
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('words the close-time refusals', async () => {
    const data = new FormData()
    data.set('close_at', new Date(Date.now() + 3_600_000).toISOString())
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'close time must be in the future' } })
    expect(await updateMarketAction('m1', undefined, data)).toEqual({ formError: 'Choose a close time in the future.', field: 'close_at' })
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "this market has been settled, so its close time can't change" } })
    expect(await updateMarketAction('m1', undefined, data)).toEqual({ formError: 'This market has been settled, so its close time can’t change.' })
  })

  it('refuses a blank or too-long category without calling the database', async () => {
    expect(await updateMarketAction('m1', undefined, form('Fine', '', ' '))).toEqual({ formError: 'Choose a category.', field: 'category' })
    expect(await updateMarketAction('m1', undefined, form('Fine', '', 'c'.repeat(25)))).toEqual({
      formError: 'Category can be at most 24 characters.',
      field: 'category',
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('words the database’s refusals, pointing a title refusal at the title (#203)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "this market has closed, so it can't be edited" } })
    expect(await updateMarketAction('m1', undefined, form('Late'))).toEqual({ formError: 'This market has closed, so it can’t be edited.' })

    supabase.rpc.mockResolvedValue({ data: null, error: { message: "others have bet on this market, so its title can't change" } })
    expect(await updateMarketAction('m1', undefined, form('New title'))).toEqual({
      formError: 'Others have bet on this market, so its title can’t change.',
      field: 'title',
    })
  })

  it('hides raw database text', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'relation "public.market_edits" does not exist' } })
    expect(await updateMarketAction('m1', undefined, form('Late'))).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(log).toHaveBeenCalled()
  })
})
