import { describe, expect, it, vi } from 'vitest'
import { getReviewCounts, reviewSubscriptions } from '@/lib/admin/review-counts'
import type { DbClient } from '@/lib/supabase/database'

const clientReturning = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn(async () => ({ data, error }))
  return { client: { rpc } as unknown as DbClient, rpc }
}

describe('getReviewCounts', () => {
  it('costs a plain member no query and reports nothing waiting', async () => {
    const { client, rpc } = clientReturning([{ tasks: 5, markets: 5 }])
    expect(await getReviewCounts(client, 'member')).toEqual({ tasks: 0, markets: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['reviewer', 'admin', 'owner'] as const)('reads the counts for a %s', async (role) => {
    const { client, rpc } = clientReturning([{ tasks: '2', markets: 1 }])
    expect(await getReviewCounts(client, role)).toEqual({ tasks: 2, markets: 1 })
    expect(rpc).toHaveBeenCalledWith('my_review_counts')
  })

  it('throws when the read fails, so the layout’s error page shows rather than a silent zero', async () => {
    const failure = new Error('db down')
    const { client } = clientReturning(null, failure)
    await expect(getReviewCounts(client, 'admin')).rejects.toBe(failure)
  })
})

describe('reviewSubscriptions', () => {
  it('follows task submissions for a reviewer, and closing markets too for an admin', () => {
    expect(reviewSubscriptions('member')).toEqual([])
    expect(reviewSubscriptions('reviewer')).toEqual([{ topic: 'reviews' }])
    expect(reviewSubscriptions('admin')).toEqual([{ topic: 'reviews' }, { topic: 'markets' }])
    expect(reviewSubscriptions('owner')).toEqual([{ topic: 'reviews' }, { topic: 'markets' }])
  })
})
