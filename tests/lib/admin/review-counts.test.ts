import { describe, expect, it, vi } from 'vitest'
import { getReviewCounts, readReviewCounts, reviewSubscriptions } from '@/lib/admin/review-counts'
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

// D-11: the layout's badge and Home's Needs you share this read; either renders without it.
describe('readReviewCounts', () => {
  it('reads the counts', async () => {
    const { client } = clientReturning([{ tasks: 3, markets: 0 }])
    expect(await readReviewCounts(client, 'reviewer')).toEqual({ tasks: 3, markets: 0 })
  })

  it('logs a failed read and reports nothing waiting', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('db down')
    const { client } = clientReturning(null, failure)
    expect(await readReviewCounts(client, 'admin')).toEqual({ tasks: 0, markets: 0 })
    expect(log).toHaveBeenCalledWith('Reading the review counts failed', failure)
    log.mockRestore()
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
