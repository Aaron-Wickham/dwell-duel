import type { DbClient } from '@/lib/supabase/database'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { isPostgresTimestamp, type SearchParams } from '@/lib/pagination/cursor'
import { readOrdered, type KeysetOrder, type KeysetPage } from '@/lib/pagination/keyset'
import { decodeTextCursor, quote, toBase64Url } from '@/lib/pagination/text-cursor'
import { containsPattern } from '@/lib/search/query'

export interface InviteRow {
  email: string
  claimed: boolean
  createdAt: string
}

export type InviteCounts = { waiting: number; claimed: number }

// A position in the newest-first list of invites: created_at desc, then email desc. The email is
// the key's tiebreak and the row's id, so "Show more" can focus the row it names.
export type InviteCursor = { ts: string; id: string }
export type InvitePageParams = { top: InviteCursor | null; bottom: InviteCursor | null }

const MAX_CURSOR = 1000

export function encodeInviteCursor(cursor: InviteCursor): string {
  return toBase64Url(JSON.stringify([cursor.ts, cursor.id]))
}

export function decodeInviteCursor(raw: string | string[] | undefined | null): InviteCursor | null {
  const parsed = decodeTextCursor(raw, MAX_CURSOR)
  if (!parsed || parsed.length !== 2) return null
  const [ts, id] = parsed
  if (typeof ts !== 'string' || !isPostgresTimestamp(ts)) return null
  if (typeof id !== 'string' || id.length === 0 || id.length > TEXT_LIMITS.inviteEmail) return null
  return { ts, id }
}

export function readInvitePageParams(searchParams: SearchParams, param: string): InvitePageParams {
  return { top: decodeInviteCursor(searchParams[`${param}_from`]), bottom: decodeInviteCursor(searchParams[param]) }
}

// keyset.ts's filters with the email quoted, since an email isn't a plain token. The plain
// created_at bound beside the tiebreak OR is what lets allowed_emails_created_idx (0093) seek.
function beside(c: InviteCursor, older: boolean, inclusive: boolean): string {
  const ts = quote(c.ts)
  const op = older ? 'lt' : 'gt'
  return `and(created_at.${op}e.${ts},or(created_at.${op}.${ts},and(created_at.eq.${ts},email.${op}${inclusive ? 'e' : ''}.${quote(c.id)})))`
}

export const INVITE_ORDER: KeysetOrder<InviteCursor> = {
  range: ({ top, bottom }) => {
    if (top && bottom) return `and(${beside(bottom, false, true)},${beside(top, true, true)})`
    if (bottom) return beside(bottom, false, true)
    if (top) return beside(top, true, true)
    return null
  },
  after: (key) => beside(key, true, false),
  encode: encodeInviteCursor,
}

type InviteRecord = { email: string; claimed_by: string | null; created_at: string }

const inviteKey = (row: InviteRecord): InviteCursor => ({ ts: row.created_at, id: row.email })

// One tab of Admin › Invites, newest first: Waiting (unclaimed) or Claimed, matching `query`
// anywhere in the email when it isn't empty.
export async function listInvitesPage(
  supabase: DbClient,
  options: { query: string; claimed: boolean; page: InvitePageParams },
): Promise<KeysetPage<InviteRow>> {
  const result = await readOrdered(
    options.page,
    INVITE_ORDER,
    async (filter, limit) => {
      let q = supabase.from('allowed_emails').select('email, claimed_by, created_at')
      q = options.claimed ? q.not('claimed_by', 'is', null) : q.is('claimed_by', null)
      if (options.query) q = q.ilike('email', containsPattern(options.query))
      if (filter) q = q.or(filter)
      const { data, error } = await q.order('created_at', { ascending: false }).order('email', { ascending: false }).limit(limit)
      if (error) throw error
      return data
    },
    inviteKey,
  )
  return {
    ...result,
    rows: result.rows.map((row) => ({ email: row.email, claimed: row.claimed_by !== null, createdAt: row.created_at })),
  }
}

export async function countInvites(supabase: DbClient, query: string): Promise<InviteCounts> {
  const count = async (claimed: boolean) => {
    let q = supabase.from('allowed_emails').select('email', { count: 'exact', head: true })
    q = claimed ? q.not('claimed_by', 'is', null) : q.is('claimed_by', null)
    if (query) q = q.ilike('email', containsPattern(query))
    const { count: n, error } = await q
    if (error) throw error
    return n ?? 0
  }
  const [waiting, claimed] = await Promise.all([count(false), count(true)])
  return { waiting, claimed }
}
