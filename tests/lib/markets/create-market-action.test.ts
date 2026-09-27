import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, redirect } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, redirect: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/navigation', () => ({ redirect }))

import { createMarketAction } from '@/lib/markets/create-market'

const CLOSE_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString()

function binaryForm(title: string, description = '') {
  const form = new FormData()
  form.set('title', title)
  form.set('description', description)
  form.set('kind', 'binary')
  form.set('close_at', CLOSE_AT)
  form.append('outcome_labels', 'Yes')
  form.append('outcome_labels', 'No')
  return form
}

function multipleChoiceForm(outcomes: string[]) {
  const form = new FormData()
  form.set('title', 'Who wins the trivia night?')
  form.set('kind', 'multiple_choice')
  form.set('close_at', CLOSE_AT)
  form.set('outcome_labels_text', outcomes.join('\n'))
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: 'market-1', error: null })
  redirect.mockReset()
})

describe('createMarketAction length limits', () => {
  it('refuses a title over 120 characters without creating anything', async () => {
    const state = await createMarketAction(undefined, binaryForm('a'.repeat(121)))

    expect(state).toEqual({ formError: 'Title can be at most 120 characters.', field: 'title' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('measures the title after trimming, so 120 characters with spaces around them is allowed', async () => {
    const title = 'a'.repeat(120)

    await createMarketAction(undefined, binaryForm(`  ${title}  `))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market', expect.objectContaining({ p_title: title }))
    expect(redirect).toHaveBeenCalledWith('/markets/market-1')
  })

  it('refuses a description over 1000 characters without creating anything', async () => {
    const state = await createMarketAction(undefined, binaryForm('Will it rain?', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('allows a description of exactly 1000 characters', async () => {
    await createMarketAction(undefined, binaryForm('Will it rain?', 'd'.repeat(1000)))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market', expect.objectContaining({ p_description: 'd'.repeat(1000) }))
  })

  it('accepts a description of exactly 1000 characters once its CRLF line breaks are normalised', async () => {
    // A submitted textarea turns each newline into CRLF, so this is 1001 raw characters —
    // over the limit unless the pair is counted as the one line break it represents.
    const description = `${'d'.repeat(998)}\r\n${'d'}`

    await createMarketAction(undefined, binaryForm('Will it rain?', description))

    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_market',
      expect.objectContaining({ p_description: `${'d'.repeat(998)}\n${'d'}` }),
    )
  })

  it('names the outcome that is too long by its place in the form, blanks included', async () => {
    const state = await createMarketAction(undefined, multipleChoiceForm(['Red', '', 'x'.repeat(61), 'Blue']))

    expect(state).toEqual({ formError: 'Outcome 3 can be at most 60 characters.', field: 'outcome_3' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('allows outcomes of exactly 60 characters', async () => {
    const long = 'x'.repeat(60)

    await createMarketAction(undefined, multipleChoiceForm(['Red', long]))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market', expect.objectContaining({ p_outcome_labels: ['Red', long] }))
  })
})
