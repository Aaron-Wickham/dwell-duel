'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { RATE_LIMIT_ERRORS, TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
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
    if (error.code === '23503') return { formError: 'This market no longer exists.' }
    if (error.message === RATE_LIMIT_ERRORS.comment.match) return { formError: RATE_LIMIT_ERRORS.comment.formError }
    return { formError: 'Couldn’t post your comment. Try again.' }
  }

  refresh()
  return { posted: true }
}

export type DeleteCommentState = { formError?: string } | undefined

// delete_market_comment's raises (0053).
const DELETE_COMMENT_ERRORS: readonly KnownError<never>[] = [
  { match: 'comment not found', formError: 'This comment is already gone.' },
  { match: "only the comment's author or an admin can delete it", formError: 'Only the comment’s author or an admin can delete it.' },
]

// delete_market_comment (0053) decides who may: the author, or an admin or the owner.
export async function deleteCommentAction(commentId: number, _prev: DeleteCommentState, _formData: FormData): Promise<DeleteCommentState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('delete_market_comment', { p_comment_id: commentId })
  if (error) return friendlyError(error, DELETE_COMMENT_ERRORS, 'delete_market_comment failed')

  refresh()
  return undefined
}
