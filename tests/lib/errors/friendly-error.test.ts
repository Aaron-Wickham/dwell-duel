import { describe, it, expect, vi, afterEach } from 'vitest'
import { GENERIC_ERROR, friendlyError, type KnownError } from '@/lib/errors/friendly-error'

const KNOWN: KnownError<'title'>[] = [
  { match: 'not invited', formError: 'Only invited members can do that.' },
  { match: 'markets_title_length', formError: 'Title is too long.', field: 'title' },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('friendlyError', () => {
  it("maps an RPC's exact raise message", () => {
    expect(friendlyError({ message: 'not invited' }, KNOWN, 'ctx')).toEqual({ formError: 'Only invited members can do that.' })
  })

  it('maps a constraint violation by the quoted constraint name, with its field', () => {
    const error = { message: 'new row for relation "markets" violates check constraint "markets_title_length"' }
    expect(friendlyError(error, KNOWN, 'ctx')).toEqual({ formError: 'Title is too long.', field: 'title' })
  })

  it('does not match a raise message that only contains a known one', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(friendlyError({ message: 'you are not invited here' }, KNOWN, 'ctx')).toEqual({ formError: GENERIC_ERROR })
  })

  it('shows anything else as a generic message and logs the original', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = { message: 'relation "public.markets" does not exist' }
    expect(friendlyError(error, KNOWN, 'create_market failed')).toEqual({ formError: GENERIC_ERROR })
    expect(log).toHaveBeenCalledWith('create_market failed', error)
  })
})
