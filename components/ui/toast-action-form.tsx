'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'

// Adds a success toast to a plain server action (the slip's add and remove) without making
// the presentational row that renders it a client component. The toast fires once the
// action resolves, so it still shows after the row re-renders without this form, as an
// added pick's row does when it turns into "In your slip". The action may return `false`
// for a no-op (e.g. the slip was already full, or the pick wasn't there to remove) — any
// other result, including plain `void`, still toasts.
//
// `optimistic` runs first, inside the form's transition, so the useOptimistic setters it
// calls show at once and give way to the server's state when the action settles.
export function ToastActionForm({
  action,
  successMessage,
  optimistic,
  className,
  children,
}: {
  action: (formData: FormData) => void | boolean | Promise<void | boolean>
  successMessage: string
  optimistic?: () => void
  className?: string
  children: ReactNode
}) {
  async function formAction(formData: FormData) {
    haptics.tap()
    optimistic?.()
    const result = await action(formData)
    if (result !== false) toast.success(successMessage)
  }

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  )
}
