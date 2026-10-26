'use client'

import type { MouseEvent } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'
import { PendingLabel, PendingStatus } from '@/components/ui/pending-label'

// Every submit button that posts a server action routes through here so a
// double click can't fire the same money-moving action twice. Pending uses
// aria-disabled plus a click guard rather than the disabled attribute --
// disabling a focused button can drop focus to <body> in some browsers,
// which would lose a keyboard user's place. A `pendingLabel` ("Placing…") shows beside the leaf
// loader while the action runs, so busy doesn't read as unavailable.
export function FormSubmitButton({ disabled, onClick, pendingLabel, children, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus()

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  const button = (
    <Button
      {...props}
      type="submit"
      disabled={disabled}
      aria-disabled={pending || disabled || undefined}
      onClick={handleClick}
    >
      {pendingLabel ? (
        <PendingLabel pending={pending} pendingLabel={pendingLabel}>
          {children}
        </PendingLabel>
      ) : (
        children
      )}
    </Button>
  )
  if (!pendingLabel) return button
  return (
    <>
      {button}
      <PendingStatus pending={pending} pendingLabel={pendingLabel} />
    </>
  )
}
