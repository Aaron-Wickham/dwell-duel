import type { DbClient } from '@/lib/supabase/database'
import { readKeyset, isBigintId, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { avatarUrl } from '@/lib/profile/avatar'

export type MarketComment = {
  id: number
  body: string
  createdAt: string
  profileId: string
  authorName: string
  authorAvatarSrc: string | null
}

const COMMENT_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }
// market_comments has two foreign keys to profiles (the author and whoever deleted it), so the
// author embed names its constraint.
const COMMENT_COLUMNS = 'id, body, created_at, profile_id, author:profiles!market_comments_profile_id_fkey(display_name, avatar_path)'

type CommentRow = {
  id: number
  body: string
  created_at: string
  profile_id: string
  author: { display_name: string; avatar_path: string | null } | null
}

const commentKey = (c: { id: number; created_at: string }): Cursor => ({ ts: c.created_at, id: String(c.id) })

// Deleted comments stay in the table, emptied (0053), so every read leaves them out. The range
// read and its key probe share this builder, so the two can't drift apart on filters.
function commentsQuery(supabase: DbClient, marketId: string, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('market_comments').select(columns).eq('market_id', marketId).is('deleted_at', null)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

// Newest first, as keyset pages run; the thread shows them oldest first.
export async function listMarketComments(
  supabase: DbClient,
  marketId: string,
  page: PageParams,
): Promise<KeysetPage<MarketComment>> {
  const result = await readKeyset(
    page,
    COMMENT_KEYS,
    async (filter, limit) => {
      const { data, error } = await commentsQuery(supabase, marketId, COMMENT_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as CommentRow[]
    },
    commentKey,
    async (filter, limit) => {
      const { data, error } = await commentsQuery(supabase, marketId, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(commentKey)
    },
  )

  return {
    ...result,
    rows: result.rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      profileId: c.profile_id,
      authorName: c.author?.display_name ?? 'Unknown member',
      authorAvatarSrc: avatarUrl(c.author?.avatar_path),
    })),
  }
}
