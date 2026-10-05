'use client'

import { useActionState, useState } from 'react'
import type { MemberSummary } from '@/lib/members/list-members'
import { ROLE_LABELS, type Role } from '@/lib/auth/roles'
import { setMemberRoleAction, type SetRoleState } from '@/lib/admin/owner-actions'
import { ConfirmSubmitDialog, useConfirmSubmit } from '@/components/ui/confirm-submit-dialog'
import { Select } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

const ASSIGNABLE = ['admin', 'reviewer', 'member'] as const

// Owner only: the owner's own role never appears here, and the RPC refuses it anyway.
export function RoleForm({ member }: { member: MemberSummary }) {
  const [role, setRole] = useState<Role>(member.role)
  const confirm = useConfirmSubmit()
  const [state, formAction, isPending] = useActionState<SetRoleState, FormData>(
    withSuccessToast(
      async (prev: SetRoleState, formData: FormData) => {
        const next = await setMemberRoleAction(member.id, prev, formData)
        confirm.setOpen(false)
        return next
      },
      (s) => Boolean(s?.formError),
      `${member.displayName}’s role saved.`,
    ),
    undefined,
  )
  const formId = `role-${member.id}-form`
  const selectId = `role-${member.id}`
  const errorId = `role-${member.id}-error`

  return (
    <form
      id={formId}
      action={formAction}
      onSubmit={(e) => {
        if (role !== member.role) confirm.onSubmit(e)
      }}
      className="flex flex-col gap-3"
    >
      {/* The card's heading already says Role (CR-B12), so the label is for screen readers only. */}
      <div className="flex flex-col">
        <label htmlFor={selectId} className="sr-only">
          Role
        </label>
        <Select
          id={selectId}
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? errorId : undefined}
        >
          {ASSIGNABLE.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      <FormSubmitButton variant="secondary" block>
        Save role <span className="sr-only">for {member.displayName}</span>
      </FormSubmitButton>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <ConfirmSubmitDialog
        formId={formId}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        pending={isPending}
        title={`Change ${member.displayName}’s role?`}
        description={`${member.displayName} goes from ${ROLE_LABELS[member.role]} to ${ROLE_LABELS[role]}, straight away.`}
        confirmLabel="Change role"
      />
    </form>
  )
}
