import type { DbClient } from '@/lib/supabase/database'

// 0103 seeds it with this id, and every market made without a category lands in it.
export const OTHER_CATEGORY_ID = '00000000-0000-4000-8000-000000000327'

// How many categories the markets list shows as chips before More…, and the create form suggests.
export const BUSIEST_CHIPS = 8
export const MOST_USED_CHIPS = 6

export interface CategoryCount {
  id: string
  name: string
  slug: string
  hiddenAt: string | null
  // Markets still taking bets, and every market, in the category.
  openMarkets: number
  markets: number
}

export type MarketCategory = { name: string; slug: string }

// category_counts (0103) ranks them busiest first: open markets, then every market, then name.
export async function listCategoryCounts(supabase: DbClient, includeHidden = false): Promise<CategoryCount[]> {
  const { data, error } = await supabase.rpc('category_counts', { p_include_hidden: includeHidden })
  if (error) throw error
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    hiddenAt: c.hidden_at,
    openMarkets: c.open_markets,
    markets: c.markets,
  }))
}

export function busiestCategories(counts: CategoryCount[], n = BUSIEST_CHIPS): CategoryCount[] {
  return counts.slice(0, n)
}

// The create form's suggestions: the most markets ever, not just open ones, so a category used
// every week still shows between its markets.
export function mostUsedCategories(counts: CategoryCount[], n = MOST_USED_CHIPS): CategoryCount[] {
  return [...counts]
    .sort((a, b) => b.markets - a.markets || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .slice(0, n)
}

// The database stores a name trimmed with each run of whitespace one space, and compares slugs.
export function normalizeCategoryName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

export function categorySlug(name: string): string {
  return normalizeCategoryName(name).toLowerCase().replace(/ /g, '-')
}

// ?category= names a slug; anything that isn't one of the visible categories falls through to All.
export function readCategoryParam(raw: string | string[] | undefined, counts: CategoryCount[]): CategoryCount | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  const slug = value.toLowerCase()
  return counts.find((c) => c.slug === slug) ?? null
}
