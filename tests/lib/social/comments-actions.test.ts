import { describe, it, expect, vi, beforeEach } from 'vitest'

const { insert, rpc, refresh } = vi.hoisted(() => ({ insert: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }))
const supabase = { from: () => ({ insert }), rpc }
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ refresh }))

import { deleteCommentAction, postCommentAction } from '@/lib/social/comments-actions'

const MARKET = '11111111-1111-4111-8111-111111111111'

function form(body: string) {
  const data = new FormData()
  data.set('body', body)
  return data
}

beforeEach(() => {
  insert.mockReset()
  insert.mockResolvedValue({ error: null })
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  refresh.mockReset()
})

describe('postCommentAction', () => {
  it('posts the trimmed comment as the signed-in member and refreshes the page', async () => {
    expect(await postCommentAction(MARKET, undefined, form('  Yes is a lock \r\nfor sure  '))).toEqual({ posted: true })
    expect(insert).toHaveBeenCalledWith({ market_id: MARKET, profile_id: 'member-1', body: 'Yes is a lock \nfor sure' })
    expect(refresh).toHaveBeenCalled()
  })

  it('refuses an empty comment', async () => {
    expect(await postCommentAction(MARKET, undefined, form('   '))).toEqual({ formError: 'Write a comment first.' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses a comment over 280 characters, counting after the trim', async () => {
    expect(await postCommentAction(MARKET, undefined, form('a'.repeat(281)))).toEqual({
      formError: 'A comment can be at most 280 characters.',
    })
    expect(insert).not.toHaveBeenCalled()

    expect(await postCommentAction(MARKET, undefined, form(` ${'a'.repeat(280)} `))).toEqual({ posted: true })
  })

  it('says so when the market has gone', async () => {
    insert.mockResolvedValue({ error: { code: '23503', message: 'fk' } })
    expect(await postCommentAction(MARKET, undefined, form('Hi'))).toEqual({ formError: 'This market no longer exists.' })
    expect(await postCommentAction('not-a-uuid', undefined, form('Hi'))).toEqual({ formError: 'This market no longer exists.' })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('deleteCommentAction', () => {
  it('deletes through delete_market_comment and refreshes the page', async () => {
    expect(await deleteCommentAction(7, undefined, new FormData())).toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('delete_market_comment', { p_comment_id: 7 })
    expect(refresh).toHaveBeenCalled()
  })

  it("words the database's refusal, and hides anything it doesn't know (#203)", async () => {
    rpc.mockResolvedValue({ error: { message: 'only the comment\'s author or an admin can delete it' } })
    expect(await deleteCommentAction(7, undefined, new FormData())).toEqual({
      formError: 'Only the comment’s author or an admin can delete it.',
    })
    expect(refresh).not.toHaveBeenCalled()

    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ error: { message: 'permission denied for table market_comments' } })
    expect(await deleteCommentAction(7, undefined, new FormData())).toEqual({ formError: 'Something went wrong. Try again.' })
    expect(log).toHaveBeenCalled()
  })
})

describe('postCommentAction attempt key (#258)', () => {
  const KEY = '3f0c1d52-6a52-4a0e-9a0b-0c5f3a9a4b11'

  it('stores the key, and treats a repeat of it as posted', async () => {
    const data = form('Hello')
    data.set('idempotency_key', KEY)
    await postCommentAction(MARKET, undefined, data)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ attempt_key: KEY }))

    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint "market_comments_attempt_key_idx"' } })
    expect(await postCommentAction(MARKET, undefined, data)).toEqual({ posted: true })
  })
})
