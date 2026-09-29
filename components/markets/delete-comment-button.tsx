'use client'

import { ConfirmActionButton } from '@/components/ui/confirm-action-button'
import { deleteCommentAction } from '@/lib/social/comments-actions'

export function DeleteCommentButton({ commentId, authorName, own }: { commentId: number; authorName: string; own: boolean }) {
  return (
    <ConfirmActionButton
      id={`delete-comment-${commentId}`}
      trigger="Delete"
      triggerLabel={own ? 'Delete your comment' : `Delete ${authorName}’s comment`}
      triggerVariant="quiet"
      triggerSize="sm"
      title="Delete this comment?"
      description={own ? 'It’s removed for everyone. This can’t be undone.' : `${authorName}’s comment is removed for everyone. This can’t be undone.`}
      confirmLabel="Delete comment"
      successMessage="Comment deleted."
      action={deleteCommentAction.bind(null, commentId)}
    />
  )
}
