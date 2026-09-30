import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, redirect } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, redirect: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/navigation', () => ({ redirect }))
const { notifyNewMarket } = vi.hoisted(() => ({ notifyNewMarket: vi.fn() }))
vi.mock('@/lib/push/notify', () => ({ afterAction: (fn: () => void) => fn(), notifyNewMarket }))

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
  supabase.rpc.mockResolvedValue({ data: { market_id: 'market-1', replayed: false }, error: null })
  redirect.mockReset()
  notifyNewMarket.mockReset()
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

    expect(supabase.rpc).toHaveBeenCalledWith('create_market_v2', expect.objectContaining({ p_title: title }))
    expect(redirect).toHaveBeenCalledWith('/markets/market-1')
  })

  it('refuses a description over 1000 characters without creating anything', async () => {
    const state = await createMarketAction(undefined, binaryForm('Will it rain?', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('allows a description of exactly 1000 characters', async () => {
    await createMarketAction(undefined, binaryForm('Will it rain?', 'd'.repeat(1000)))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market_v2', expect.objectContaining({ p_description: 'd'.repeat(1000) }))
  })

  it('accepts a description of exactly 1000 characters once its CRLF line breaks are normalised', async () => {
    // A submitted textarea turns each newline into CRLF, so this is 1001 raw characters —
    // over the limit unless the pair is counted as the one line break it represents.
    const description = `${'d'.repeat(998)}\r\n${'d'}`

    await createMarketAction(undefined, binaryForm('Will it rain?', description))

    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_market_v2',
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

    expect(supabase.rpc).toHaveBeenCalledWith('create_market_v2', expect.objectContaining({ p_outcome_labels: ['Red', long] }))
  })
})

describe('createMarketAction over/under', () => {
  function overUnderForm(line: string) {
    const form = new FormData()
    form.set('title', 'Times Sean says bet')
    form.set('kind', 'over_under')
    form.set('close_at', CLOSE_AT)
    form.set('line', line)
    return form
  }

  it('sends the line and lets create_market make the outcomes', async () => {
    await createMarketAction(undefined, overUnderForm('3.5'))
    expect(supabase.rpc).toHaveBeenCalledWith('create_market_v2', {
      p_title: 'Times Sean says bet',
      p_description: null,
      p_kind: 'over_under',
      p_outcome_labels: [],
      p_close_at: CLOSE_AT,
      p_line: 3.5,
    })
    expect(redirect).toHaveBeenCalledWith('/markets/market-1')
  })

  it('refuses a line that isn’t a half number', async () => {
    for (const line of ['3', '3.25', '0', '', 'abc']) {
      expect(await createMarketAction(undefined, overUnderForm(line)), line).toEqual({
        formError: 'Set the line to a half number, like 3.5.',
        field: 'line',
      })
    }
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe('createMarketAction database errors', () => {
  it("rewords create_market's own errors", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'a market may have at most 6 outcomes' } })

    const state = await createMarketAction(undefined, multipleChoiceForm(['A', 'B', 'C', 'D', 'E', 'F', 'G']))

    expect(state).toEqual({ formError: 'A market can have at most 6 outcomes.', field: 'outcomes' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('names a duplicate outcome instead of showing the unique violation', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "market_outcomes_market_id_label_key"' },
    })

    const state = await createMarketAction(undefined, multipleChoiceForm(['Grace', 'Grace']))

    expect(state).toEqual({ formError: 'Give each outcome a different name.', field: 'outcomes' })
  })

  it('hides an unknown error behind a generic message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal error' } })

    const state = await createMarketAction(undefined, binaryForm('Will it rain?'))

    expect(state).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})

describe('createMarketAction attempt key (#258)', () => {
  const KEY = '3f0c1d52-6a52-4a0e-9a0b-0c5f3a9a4b11'

  it('passes a valid key to create_market_v2 and ignores a malformed one', async () => {
    const keyed = binaryForm('Will it rain?')
    keyed.set('idempotency_key', KEY)
    await createMarketAction(undefined, keyed)
    expect(supabase.rpc).toHaveBeenLastCalledWith('create_market_v2', expect.objectContaining({ p_idempotency_key: KEY }))

    const bad = binaryForm('Will it rain?')
    bad.set('idempotency_key', 'nope')
    await createMarketAction(undefined, bad)
    expect(supabase.rpc).toHaveBeenLastCalledWith('create_market_v2', expect.objectContaining({ p_idempotency_key: undefined }))
  })
})

describe('createMarketAction replay', () => {
  it('announces a new market once, not again when the same key replays', async () => {
    await createMarketAction(undefined, binaryForm('Will it rain?'))
    expect(notifyNewMarket).toHaveBeenCalledTimes(1)
    expect(notifyNewMarket).toHaveBeenCalledWith('market-1')

    notifyNewMarket.mockClear()
    supabase.rpc.mockResolvedValue({ data: { market_id: 'market-1', replayed: true }, error: null })
    await createMarketAction(undefined, binaryForm('Will it rain?'))
    expect(notifyNewMarket).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenLastCalledWith('/markets/market-1')
  })
})
