'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'

// Adds a success toast to a plain server action (the slip's add and remove return nothing)
// without making the presentational row that renders it a client component. The toast fires
// once the action resolves, so it still shows after the row re-renders without this form, as
// an added pick's row does when it turns into "In your slip".
export function ToastActionForm({
  action,
  successMessage,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  successMessage: string
  className?: string
  children: ReactNode
}) {
  async function formAction(formData: FormData) {
    await action(formData)
    toast.success(successMessage)
  }

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  )
}
