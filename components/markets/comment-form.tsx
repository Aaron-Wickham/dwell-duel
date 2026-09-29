'use client'

import { useActionState, useState } from 'react'
import { Field, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { postCommentAction, type CommentState } from '@/lib/social/comments-actions'

// Not optimistic: the comment shows once it's saved. The draft is controlled, so React's reset
// after the action leaves it in place on an error; only a posted comment clears it.
export function CommentForm({ marketId }: { marketId: string }) {
  const [draft, setDraft] = useState('')
  const [state, formAction] = useActionState<CommentState, FormData>(
    withSuccessToast(
      async (prev: CommentState, formData: FormData) => {
        const next = await postCommentAction(marketId, prev, formData)
        if (next?.posted) setDraft('')
        return next
      },
      (s) => Boolean(s?.formError),
      'Comment posted.',
    ),
    undefined,
  )
  const errorId = 'comment-error'
  const hintId = 'comment-body-hint'

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Add a comment" htmlFor="comment-body" hint={`Up to ${TEXT_LIMITS.commentBody} characters.`}>
        <Textarea
          id="comment-body"
          name="body"
          required
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={TEXT_LIMITS.commentBody}
          className="min-h-[88px]"
          aria-invalid={state?.formError ? true : undefined}
          aria-describedby={state?.formError ? `${hintId} ${errorId}` : hintId}
        />
      </Field>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <FormSubmitButton size="sm" className="self-start">
        Post comment
      </FormSubmitButton>
    </form>
  )
}
