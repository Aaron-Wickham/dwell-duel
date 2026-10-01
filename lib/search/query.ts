// A search box's ?q=, trimmed, and capped so a pasted essay can't make a long filter.
export const SEARCH_MAX = 100

export function readSearchQuery(raw: string | string[] | undefined): string {
  return typeof raw === 'string' ? raw.trim().slice(0, SEARCH_MAX) : ''
}

// A PostgREST ilike pattern matching q anywhere, taken literally: \, % and _ are escaped, and *,
// which PostgREST reads as %, is dropped.
export function containsPattern(q: string): string {
  return `%${q.replace(/\*/g, '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
