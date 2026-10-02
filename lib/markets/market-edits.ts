import type { DbClient } from '@/lib/supabase/database'

export interface MarketEdit {
  id: number
  editedAt: string
  editorName: string
  oldTitle: string
  newTitle: string
  oldDescription: string | null
  newDescription: string | null
  // Set only on an edit that changed the category (0103).
  oldCategory: string | null
  newCategory: string | null
  // Set only on an edit that moved the close time (0106).
  oldCloseAt: string | null
  newCloseAt: string | null
}

// Newest first. Every member can read a market's edits (0043), so a question reworded after
// people bet on it, or a close time moved, is always on the record.
export async function listMarketEdits(supabase: DbClient, marketId: string): Promise<MarketEdit[]> {
  const { data, error } = await supabase
    .from('market_edits')
    .select(
      'id, edited_at, old_title, new_title, old_description, new_description, old_close_at, new_close_at, editor:profiles(display_name), old_category:market_categories!market_edits_old_category_id_fkey(name), new_category:market_categories!market_edits_new_category_id_fkey(name)',
    )
    .eq('market_id', marketId)
    .order('edited_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: e.id,
    editedAt: e.edited_at,
    editorName: (e.editor)?.display_name ?? 'Unknown member',
    oldTitle: e.old_title,
    newTitle: e.new_title,
    oldDescription: e.old_description,
    newDescription: e.new_description,
    oldCategory: e.old_category?.name ?? null,
    newCategory: e.new_category?.name ?? null,
    oldCloseAt: e.old_close_at,
    newCloseAt: e.new_close_at,
  }))
}
