'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'

// Adds a success toast to a plain server action (the slip's add and remove) without making
// the presentational row that renders it a client component. The toast fires once the
// action resolves, so it still shows after the row re-renders without this form, as an
// added pick's row does when it turns into "In your slip". The action may return `false`
// for a no-op (e.g. the slip was already full, or the pick wasn't there to remove) — any
// other result, including plain `void`, still toasts.
export function ToastActionForm({
  action,
  successMessage,
  className,
  children,
}: {
  action: (formData: FormData) => void | boolean | Promise<void | boolean>
  successMessage: string
  className?: string
  children: ReactNode
}) {
  async function formAction(formData: FormData) {
    const result = await action(formData)
    if (result !== false) toast.success(successMessage)
  }

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  )
}
