'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { haptics } from '@/lib/haptics'

export type ToastActionResult = void | boolean | { error: string }

// Adds a success toast to a plain server action (the slip's add and remove) without making
// the presentational row that renders it a client component. The toast fires once the
// action resolves, so it still shows after the row re-renders without this form, as an
// added pick's row does when it turns into "In your slip". The action may return `false`
// for a no-op (e.g. the pick wasn't there to remove), or `{ error }` for a refusal worth
// telling the member about (the slip filled up in another tab) — any other result, including
// plain `void`, still toasts.
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
  action: (formData: FormData) => ToastActionResult | Promise<ToastActionResult>
  successMessage: string
  optimistic?: () => void
  className?: string
  children: ReactNode
}) {
  async function formAction(formData: FormData) {
    haptics.tap()
    optimistic?.()
    const result = await action(formData)
    if (typeof result === 'object' && result !== null) {
      toast.error(result.error)
      haptics.error()
    } else if (result !== false) toast.success(successMessage)
  }

  return (
    <form action={formAction} className={className}>
      {children}
    </form>
  )
}
