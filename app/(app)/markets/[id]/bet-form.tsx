'use client'

import { useActionState } from 'react'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Field, Input, Select } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { placeBetAction, type ActionState } from '@/lib/markets/place-bet'

export function BetForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = withSuccessToast(
    placeBetAction.bind(null, marketId),
    (s) => Boolean(s?.formError),
    'Bet placed.',
  )
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Outcome" htmlFor="bet-outcome">
          <Select id="bet-outcome" name="outcome_id" required>
            {outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (DC)" htmlFor="bet-amount">
          <Input
            id="bet-amount"
            name="amount"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            required
            placeholder="Amount (DC)"
            aria-invalid={Boolean(state?.formError)}
            aria-describedby={state?.formError ? 'bet-error' : undefined}
          />
        </Field>
        <FormSubmitButton block>Place bet</FormSubmitButton>
      </form>
      {state?.formError && (
        <Message tone="error" id="bet-error">
          {state.formError}
        </Message>
      )}
    </>
  )
}
