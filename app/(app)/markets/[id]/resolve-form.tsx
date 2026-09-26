'use client'

import { useActionState } from 'react'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Field, Select } from '@/components/ui/field'
import { Message } from '@/components/ui/message'
import { resolveMarketAction, type ActionState } from '@/lib/markets/resolve-market'

export function ResolveForm({ marketId, outcomes }: { marketId: string; outcomes: { id: string; label: string }[] }) {
  const boundAction = resolveMarketAction.bind(null, marketId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <>
      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Winning outcome" htmlFor="resolve-outcome">
          <Select
            id="resolve-outcome"
            name="outcome_id"
            required
            defaultValue=""
            aria-invalid={Boolean(state?.formError)}
            aria-describedby={state?.formError ? 'resolve-error' : undefined}
          >
            <option value="" disabled>
              Choose the winner…
            </option>
            {outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <FormSubmitButton block>Confirm outcome</FormSubmitButton>
      </form>
      {state?.formError && (
        <Message tone="error" id="resolve-error">
          {state.formError}
        </Message>
      )}
    </>
  )
}
