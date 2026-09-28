'use client'

import { useActionState } from 'react'
import type { MemberSummary } from '@/lib/members/list-members'
import { ROLE_LABELS } from '@/lib/auth/roles'
import { setMemberRoleAction, type SetRoleState } from '@/lib/admin/owner-actions'
import { Field, Select } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

const ASSIGNABLE = ['admin', 'reviewer', 'member'] as const

// Owner only: the owner's own role never appears here, and the RPC refuses it anyway.
export function RoleForm({ member }: { member: MemberSummary }) {
  const [state, formAction] = useActionState<SetRoleState, FormData>(
    withSuccessToast(setMemberRoleAction.bind(null, member.id), (s) => Boolean(s?.formError), `${member.displayName}’s role saved.`),
    undefined,
  )
  const selectId = `role-${member.id}`
  const errorId = `role-${member.id}-error`

  return (
    <form action={formAction} className="flex flex-col gap-2 md:flex-row md:items-end md:gap-2">
      <Field label="Role" htmlFor={selectId} className="md:w-48">
        <Select
          id={selectId}
          name="role"
          defaultValue={member.role}
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? errorId : undefined}
        >
          {ASSIGNABLE.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </Field>
      <FormSubmitButton variant="secondary" className="md:w-auto">
        Save role <span className="sr-only">for {member.displayName}</span>
      </FormSubmitButton>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </form>
  )
}
