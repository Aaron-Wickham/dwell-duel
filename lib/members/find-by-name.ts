import type { DbClient } from '@/lib/supabase/database'
import { containsPattern } from '@/lib/search/query'

export type MemberName = { id: string; name: string }

// How many matches Admin › Ledger lists when a name fits more than one member.
export const NAME_MATCHES_SHOWN = 5

// A name matched whole, any case: containsPattern's escaping without its wildcards.
function exactPattern(name: string): string {
  return containsPattern(name).slice(1, -1)
}

// Admin › Ledger's member filter (#430): the members, removed or not, a typed name fits. A name
// that is someone's whole name, any case, picks them even when it's part of others' too ("Bob"
// beside "Bobby"); otherwise it's every name containing it. One more than NAME_MATCHES_SHOWN is
// read, so the page can tell "these five" from "these five and more".
export async function findMembersByName(supabase: DbClient, name: string): Promise<MemberName[]> {
  const read = async (pattern: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', pattern)
      .order('display_name')
      .order('id')
      .limit(NAME_MATCHES_SHOWN + 1)
    if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, name: row.display_name }))
  }
  const exact = await read(exactPattern(name))
  return exact.length > 0 ? exact : read(containsPattern(name))
}
