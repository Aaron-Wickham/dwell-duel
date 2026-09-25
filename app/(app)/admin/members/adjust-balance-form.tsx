'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'
import type { MemberSummary } from '@/lib/members/list-members'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Message } from '@/components/ui/message'

export function AdjustBalanceForm({ member }: { member: MemberSummary }) {
  const boundAction = adjustBalanceAction.bind(null, member.id)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)
  const amountId = `adjust-${member.id}-amount`
  const reasonId = `adjust-${member.id}-reason`
  const errorId = `adjust-${member.id}-error`

  return (
    <>
      <form action={formAction} className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        <div className="flex items-center gap-3 md:w-60 md:shrink-0 md:self-center">
          <Avatar name={member.displayName} />
          <div className="flex min-w-0 grow flex-col">
            <Link href={`/members/${member.id}`} className="font-extrabold">
              {member.displayName}
            </Link>
            <span className="text-sm text-ink2 tabular-nums">{member.balance} DC</span>
          </div>
        </div>
        <div className="flex min-w-0 grow items-end gap-2">
          <Field label="Amount" htmlFor={amountId} className="w-[108px] shrink-0 md:w-[150px]">
            <Input
              id={amountId}
              name="amount"
              type="number"
              step="1"
              required
              placeholder="+/−"
              aria-invalid={state?.field === 'amount'}
              aria-describedby={state?.field === 'amount' ? errorId : undefined}
            />
          </Field>
          <Field label="Reason" htmlFor={reasonId} className="grow">
            <Input
              id={reasonId}
              name="reason"
              aria-invalid={state?.field === 'reason'}
              aria-describedby={state?.field === 'reason' ? errorId : undefined}
            />
          </Field>
        </div>
        <Button type="submit" block className="md:w-auto">
          Adjust{' '}
          <span className="sr-only">{member.displayName}</span>
        </Button>
      </form>
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
    </>
  )
}
