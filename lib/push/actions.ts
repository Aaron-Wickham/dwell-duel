'use server'

import { headers } from 'next/headers'
import { requireUser } from '@/lib/auth/require-user'
import { NOTIFICATION_KINDS } from './prefs'
import { SUBSCRIPTION_LIMITS, validSubscription } from './subscription'

export type SubscriptionResult = { error?: string }

export async function savePushSubscriptionAction(input: unknown): Promise<SubscriptionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { error: 'Not signed in.' }

  const subscription = validSubscription(input)
  if (!subscription) return { error: 'This browser’s notification service isn’t supported.' }

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
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', String(endpoint))
  if (error) {
    console.error('Deleting a push subscription failed', error)
    return { error: 'Couldn’t turn off notifications. Check your connection and try again.' }
  }
  return {}
}

export type PrefsState = { formError?: string } | undefined

export async function saveNotificationPrefsAction(_prev: PrefsState, formData: FormData): Promise<PrefsState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const choices = Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, formData.get(kind) === 'on']))
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ profile_id: user.id, ...choices, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  if (error) {
    console.error('Saving notification preferences failed', error)
    return { formError: 'Couldn’t save your notification choices. Check your connection and try again.' }
  }
  return undefined
}
