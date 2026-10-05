'use client'

import { useActionState, useState } from 'react'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Field, Textarea } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { voidMarketAction, type ActionState } from '@/lib/markets/void-market'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { focusPageHeading } from '@/lib/ui/focus-page-heading'

const FORM_ID = 'void-form'

// Every void says why (0073), as every resolution does; the reason shows on the market and in the
// feed. A successful void stops the page rendering this form, so focus goes to the page heading.
export function VoidForm({ marketId }: { marketId: string }) {
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const confirm = useConfirmSubmit()
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        try {
          const next = await voidMarketAction(marketId, prev, formData)
          if (!next?.formError) {
            setReason('')
            setDone(true)
          }
          return next
        } finally {
          confirm.setOpen(false)
        }
      },
      (s) => Boolean(s?.formError),
      'Market called off.',
    ),
    undefined,
  )
  const reasonError = state?.field === 'reason'

  return (
    <div className="flex flex-col gap-2">
      <form id={FORM_ID} action={formAction} onSubmit={confirm.onSubmit} className="flex flex-col gap-4">
        <Field label="Why call off this market?" htmlFor="void-reason" hint="Everyone sees this. Every bet is refunded, and parlays drop this pick and carry on.">
          <Textarea
            id="void-reason"
            name="reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={TEXT_LIMITS.voidReason}
            aria-invalid={reasonError}
            aria-describedby={['void-reason-hint', reasonError ? 'void-error' : null].filter(Boolean).join(' ')}
          />
        </Field>
        <FormSubmitButton
          variant="danger"
          className="self-start"
          aria-describedby={state?.formError && !reasonError ? 'void-error' : undefined}
        >
          Call off this market
        </FormSubmitButton>
      </form>
      <ConfirmSubmitDialog
        formId={FORM_ID}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isPending}
        finalFocus={done ? focusPageHeading : true}
        variant="danger"
        title="Call off this market?"
        description="Every bet is refunded, and parlays drop this pick and carry on with the rest. This can’t be undone."
        confirmLabel="Call off market"
      />
      {state?.formError && (
        <Message tone="error" id="void-error">
          {state.formError}
        </Message>
      )}
    </div>
  )
}
