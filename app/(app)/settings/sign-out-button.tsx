'use client'

import { signOut } from '@/lib/auth/sign-out'
import { deletePushSubscriptionAction } from '@/lib/push/actions'
import { clearAllPushMemory } from '@/lib/push/client'
import { FormSubmitButton } from '@/components/ui/form-submit-button'

// A service worker that never answers mustn't hold up signing out.
const STOP_PUSH_TIMEOUT_MS = 5_000

// This device stops getting this member's pushes: the row goes while the session can still delete
// it, then the browser's subscription. Either failing still unsubscribes what it can; a row left
// behind is deleted the next time a push to it comes back 410.
async function stopPushOnThisDevice(): Promise<void> {
  clearAllPushMemory(localStorage)
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  try {
    await deletePushSubscriptionAction(subscription.endpoint)
  } finally {
    await subscription.unsubscribe()
  }
}

async function signOutThisDevice(): Promise<void> {
  try {
    await Promise.race([
      stopPushOnThisDevice(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out')), STOP_PUSH_TIMEOUT_MS)),
    ])
  } catch (error) {
    console.error('Stopping notifications on sign-out failed', error)
  }
  await signOut()
}

export function SignOutButton() {
  return (
    <form action={signOutThisDevice}>
      <FormSubmitButton variant="secondary" block className="md:w-auto">
        Sign out
      </FormSubmitButton>
    </form>
  )
}
