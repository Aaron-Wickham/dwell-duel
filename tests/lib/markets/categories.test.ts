import { describe, it, expect, vi } from 'vitest'
import {
  categorySlug,
  listCategoryCounts,
  mostUsedCategories,
  normalizeCategoryName,
  readCategoryParam,
  type CategoryCount,
} from '@/lib/markets/categories'
import type { DbClient } from '@/lib/supabase/database'

const cat = (name: string, openMarkets: number, markets: number): CategoryCount => ({
  id: `id-${name}`,
  name,
  slug: categorySlug(name),
  hiddenAt: null,
  openMarkets,
  markets,
})

describe('categories', () => {
  it('normalises a name and its slug the way the database does', () => {
    expect(normalizeCategoryName('  Bible \t  Study ')).toBe('Bible Study')
    expect(categorySlug('  Bible   Study ')).toBe('bible-study')
  })

  it('ranks the most used by every market, then by name', () => {
    const counts = [cat('Weather', 3, 3), cat('bible study', 0, 9), cat('Arts', 0, 3), cat('Sports', 1, 1)]
    expect(mostUsedCategories(counts).map((c) => c.name)).toEqual(['bible study', 'Arts', 'Weather', 'Sports'])
  })

  it('reads ?category= as a visible slug, any case, and drops anything else', () => {
    const counts = [cat('Bible Study', 1, 1)]
    expect(readCategoryParam('Bible-Study', counts)?.name).toBe('Bible Study')
    expect(readCategoryParam(['bible-study', 'x'], counts)?.name).toBe('Bible Study')
    expect(readCategoryParam('sports', counts)).toBeNull()
    expect(readCategoryParam(undefined, counts)).toBeNull()
  })

  it('maps category_counts rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'a', name: 'Arts', slug: 'arts', hidden_at: null, open_markets: 2, markets: 5 }],
      error: null,
    })
    const counts = await listCategoryCounts({ rpc } as unknown as DbClient, true)
    expect(rpc).toHaveBeenCalledWith('category_counts', { p_include_hidden: true })
    expect(counts).toEqual([{ id: 'a', name: 'Arts', slug: 'arts', hiddenAt: null, openMarkets: 2, markets: 5 }])
  })
})
