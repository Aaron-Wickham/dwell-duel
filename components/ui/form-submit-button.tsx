'use client'

import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'

// Every submit button that posts a server action routes through here so a
// double click can't fire the same money-moving action twice.
export function FormSubmitButton({ disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus()
  return <Button {...props} type="submit" disabled={pending || disabled} aria-disabled={pending || undefined} />
}
