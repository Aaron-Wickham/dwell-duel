import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '@/lib/supabase/database'

// Next's data cache, as unstable_cache uses it: keyed by the key parts and the arguments, a hit
// never calls the function, and a throw is never stored.
const { store, options, updateTag } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  options: [] as unknown[],
  updateTag: vi.fn(),
}))
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[], opts: unknown) => {
    options.push(opts)
    return async (...args: A): Promise<R> => {
      const key = JSON.stringify([keyParts, args])
      if (store.has(key)) return store.get(key) as R
      const value = await fn(...args)
      store.set(key, value)
      return value
    }
  },
  updateTag,
}))

import { GROUP_READS_REVALIDATE_S, GROUP_READS_TAG, groupRead, revalidateGroupReads } from '@/lib/cache/group-reads'
import { cachedCategoryCounts } from '@/lib/markets/categories'

function client(invited: boolean | Error, rows: unknown[] = []) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'is_invited') return invited instanceof Error ? { data: null, error: invited } : { data: invited, error: null }
    return { data: rows, error: null }
  })
  return { client: { rpc } as unknown as DbClient, rpc }
}

beforeEach(() => {
  store.clear()
  options.length = 0
  updateTag.mockReset()
})

describe('groupRead', () => {
  it('serves an invited member’s read to the next member, for 30 seconds under the group tag', async () => {
    const read = vi.fn(async () => ['board'])
    expect(await groupRead(client(true).client, 'board', 'page-1', read)).toEqual(['board'])
    expect(await groupRead(client(true).client, 'board', 'page-1', read)).toEqual(['board'])
    expect(read).toHaveBeenCalledTimes(1)
    expect(options[0]).toEqual({ revalidate: GROUP_READS_REVALIDATE_S, tags: [GROUP_READS_TAG] })
    expect(GROUP_READS_REVALIDATE_S).toBe(30)
  })

  it('keeps each read and each key apart', async () => {
    const read = vi.fn(async () => 1)
    await groupRead(client(true).client, 'board', 'a', read)
    await groupRead(client(true).client, 'board', 'b', read)
    await groupRead(client(true).client, 'awards', 'a', read)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('never stores what someone not invited reads, nor shows them what was stored', async () => {
    await groupRead(client(true).client, 'board', 'k', async () => ['everyone'])
    const outsider = vi.fn(async () => [])
    expect(await groupRead(client(false).client, 'board', 'k', outsider)).toEqual([])
    expect(outsider).toHaveBeenCalledTimes(1)

    store.clear()
    await groupRead(client(false).client, 'board', 'k', async () => [])
    const member = vi.fn(async () => ['everyone'])
    expect(await groupRead(client(true).client, 'board', 'k', member)).toEqual(['everyone'])
    expect(member).toHaveBeenCalledTimes(1)
  })

  it('never stores a failed read', async () => {
    const failure = new Error('db down')
    await expect(groupRead(client(true).client, 'board', 'k', async () => Promise.reject(failure))).rejects.toBe(failure)
    const read = vi.fn(async () => ['fresh'])
    expect(await groupRead(client(true).client, 'board', 'k', read)).toEqual(['fresh'])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('throws when the invite check fails, rather than guessing', async () => {
    const failure = new Error('auth down')
    await expect(groupRead(client(failure).client, 'board', 'k', async () => 1)).rejects.toBe(failure)
  })
})

describe('revalidateGroupReads', () => {
  it('expires the group tag', () => {
    revalidateGroupReads()
    expect(updateTag).toHaveBeenCalledWith(GROUP_READS_TAG)
  })
})

describe('cachedCategoryCounts', () => {
  const row = { id: 'c1', name: 'Sports', slug: 'sports', hidden_at: null, open_markets: 2, markets: 5 }

  it('reads category_counts once for everyone, apart from the list with hidden categories', async () => {
    const first = client(true, [row])
    const counts = await cachedCategoryCounts(first.client)
    expect(counts).toEqual([{ id: 'c1', name: 'Sports', slug: 'sports', hiddenAt: null, openMarkets: 2, markets: 5 }])
    const second = client(true, [row])
    await cachedCategoryCounts(second.client)
    expect(second.rpc).not.toHaveBeenCalledWith('category_counts', expect.anything())
    await cachedCategoryCounts(second.client, true)
    expect(second.rpc).toHaveBeenCalledWith('category_counts', { p_include_hidden: true })
  })
})
