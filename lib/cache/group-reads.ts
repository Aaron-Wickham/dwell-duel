import { cache } from 'react'
import { unstable_cache, updateTag } from 'next/cache'
import type { DbClient } from '@/lib/supabase/database'

// Reads whose answer is the same for every invited member (#454): the boards, the awards, the
// race and the category counts. One member's read serves everyone's next renders, in Next's data
// cache, until it's REVALIDATE_S old or an action that moves coins (or names, or categories)
// calls revalidateGroupReads(). A render cached under a path is also cleared by revalidatePath on
// that path, which most of those actions call as well.
export const GROUP_READS_TAG = 'group-reads'
export const GROUP_READS_REVALIDATE_S = 30

// Each function reached through groupRead either refuses anyone not invited or shows them nothing,
// so only an invited member's answer may be stored for all. React's cache makes it one RPC a
// render however many group reads the page makes.
export const viewerIsInvited = cache(async (supabase: DbClient): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_invited')
  if (error) throw error
  return data === true
})

class NotInvited extends Error {}

// `name` and `key` together name the entry: `name` the read, `key` its arguments. The read runs
// with the viewer's own client, so it goes through the same policies as an uncached read; a throw
// is never stored. Anyone not invited reads past the cache, exactly as before it.
export async function groupRead<T>(supabase: DbClient, name: string, key: string, read: () => Promise<T>): Promise<T> {
  const invited = viewerIsInvited(supabase)
  const cached = unstable_cache(
    async (_key: string) => {
      if (!(await invited)) throw new NotInvited()
      return read()
    },
    ['group-read-v1', name],
    { revalidate: GROUP_READS_REVALIDATE_S, tags: [GROUP_READS_TAG] },
  )
  // Started beside the invite check rather than after it; a member not invited never sees it.
  const hit = cached(key)
  hit.catch(() => {})
  if (await invited) return hit
  return read()
}

// For a server action that changed something a group read shows: the next render reads fresh.
export function revalidateGroupReads(): void {
  updateTag(GROUP_READS_TAG)
}
