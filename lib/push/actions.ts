'use server'

import { headers } from 'next/headers'
import { requireUser } from '@/lib/auth/require-user'
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPrefs } from './prefs'
import { SUBSCRIPTION_LIMITS, validSubscription } from './subscription'
import { GENERIC_ERROR, SIGNED_OUT_ERROR } from '@/lib/errors/friendly-error'

export type SubscriptionResult = { error?: string }

export async function savePushSubscriptionAction(input: unknown): Promise<SubscriptionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { error: SIGNED_OUT_ERROR }

  const subscription = validSubscription(input)
  if (!subscription) return { error: 'This browser can’t get notifications. Try another browser, or add DwellDuel to your Home Screen.' }

  const userAgent = ((await headers()).get('user-agent') ?? '').slice(0, SUBSCRIPTION_LIMITS.userAgent)
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_user_agent: userAgent || undefined,
  })
  if (error) {
    console.error('save_push_subscription failed', error)
    return { error: 'Couldn’t turn on notifications. Check your connection and try again.' }
  }
  return {}
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<SubscriptionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { error: SIGNED_OUT_ERROR }

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', String(endpoint))
  if (error) {
    console.error('Deleting a push subscription failed', error)
    return { error: 'Couldn’t turn off notifications. Check your connection and try again.' }
  }
  return {}
}

export type PrefResult = { error?: string }

// One choice at a time, as each box is ticked (TSK-3): the upsert names only that column, so a new
// row takes 0057's and 0058's defaults for the rest, and two quick ticks can't undo each other.
export async function saveNotificationPrefAction(kind: NotificationKind, on: boolean): Promise<PrefResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { error: SIGNED_OUT_ERROR }
  if (!NOTIFICATION_KINDS.includes(kind) || typeof on !== 'boolean') return { error: GENERIC_ERROR }
  const choice: Partial<NotificationPrefs> = { [kind]: on }

  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ profile_id: user.id, ...choice, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  if (error) {
    console.error('Saving a notification preference failed', error)
    return { error: 'Couldn’t save that choice. Check your connection and try again.' }
  }
  return {}
}
