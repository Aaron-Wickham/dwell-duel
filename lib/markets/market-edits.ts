import type { SupabaseClient } from '@supabase/supabase-js'

export interface MarketEdit {
  id: number
  editedAt: string
  editorName: string
  oldTitle: string
  newTitle: string
  oldDescription: string | null
  newDescription: string | null
}

// Newest first. Every member can read a market's edits (0043), so a question reworded after
// people bet on it is always on the record.
export async function listMarketEdits(supabase: SupabaseClient, marketId: string): Promise<MarketEdit[]> {
  const { data, error } = await supabase
    .from('market_edits')
    .select('id, edited_at, old_title, new_title, old_description, new_description, editor:profiles(display_name)')
    .eq('market_id', marketId)
    .order('edited_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: e.id,
    editedAt: e.edited_at,
    editorName: (e.editor as unknown as { display_name: string } | null)?.display_name ?? 'Unknown member',
    oldTitle: e.old_title,
    newTitle: e.new_title,
    oldDescription: e.old_description,
    newDescription: e.new_description,
  }))
}
