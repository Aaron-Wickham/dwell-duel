'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { isUuid } from '@/lib/uuid'

export type CommentState = { formError?: string; posted?: boolean } | undefined

export async function postCommentAction(marketId: string, _prev: CommentState, formData: FormData): Promise<CommentState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }
  if (!isUuid(marketId)) return { formError: 'This market no longer exists.' }

  // A textarea's newlines arrive as CRLF once the browser serialises the form, doubling up
  // against maxLength, which counts one character per line break.
  const body = String(formData.get('body') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!body) return { formError: 'Write a comment first.' }
  if (body.length > TEXT_LIMITS.commentBody) return { formError: tooLong('A comment', TEXT_LIMITS.commentBody) }

  const { error } = await supabase.from('market_comments').insert({ market_id: marketId, profile_id: user.id, body })
  if (error) {
    // 23503: the market was deleted while the form was open.
    return { formError: error.code === '23503' ? 'This market no longer exists.' : 'Couldn’t post your comment. Try again.' }
  }

  refresh()
  return { posted: true }
}

export type DeleteCommentState = { formError?: string } | undefined

// delete_market_comment (0053) decides who may: the author, or an admin or the owner.
export async function deleteCommentAction(commentId: number, _prev: DeleteCommentState, _formData: FormData): Promise<DeleteCommentState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('delete_market_comment', { p_comment_id: commentId })
  if (error) return { formError: error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.' }

  refresh()
  return undefined
}
