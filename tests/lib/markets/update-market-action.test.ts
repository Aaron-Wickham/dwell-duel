import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { updateMarketAction } from '@/lib/markets/update-market'

function form(title: string, description = '') {
  const data = new FormData()
  data.set('title', title)
  data.set('description', description)
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
    expect(supabase.rpc).toHaveBeenCalledWith('update_market', { p_market_id: 'm1', p_title: 'Will it snow Sunday?', p_description: 'Before noon' })
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

  it('shows the database’s refusal as a sentence', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "this market has closed, so it can't be edited" } })
    expect(await updateMarketAction('m1', undefined, form('Late'))).toEqual({ formError: "This market has closed, so it can't be edited." })
  })
})
