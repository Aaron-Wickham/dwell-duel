'use client'

import type { MouseEvent } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'

// Every submit button that posts a server action routes through here so a
// double click can't fire the same money-moving action twice. Pending uses
// aria-disabled plus a click guard rather than the disabled attribute --
// disabling a focused button can drop focus to <body> in some browsers,
// which would lose a keyboard user's place.
export function FormSubmitButton({ disabled, onClick, ...props }: ButtonProps) {
  const { pending } = useFormStatus()

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <Button
      {...props}
      type="submit"
      disabled={disabled}
      aria-disabled={pending || disabled || undefined}
      onClick={handleClick}
    />
  )
}
