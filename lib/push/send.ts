import 'server-only'
import webpush from 'web-push'
import type { DbClient } from '@/lib/supabase/database'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import { VAPID_SUBJECT, vapidKeys } from './config'
import type { PushPayload } from './messages'
import { isPushEndpoint } from './subscription'

export interface PushMessage {
  profileId: string
  payload: PushPayload
}

export interface PushResult {
  sent: number
  removed: number
  failed: number
  // The failures that say nothing about the device: our credentials (401, 403), our own network or
  // key trouble (no status), 429 and 5xx. A run that delivers nothing while any occur is an alarm.
  systemic: number
}

// A handful at a time: a group this size has few devices, and push services throttle bursts.
const CONCURRENCY = 6
// A result a day late is still news; a reminder older than that isn't worth waking a phone for.
const TTL_SECONDS = 24 * 60 * 60
const NONE: PushResult = { sent: 0, removed: 0, failed: 0, systemic: 0 }

type Subscription = { id: string; profile_id: string; endpoint: string; p256dh: string; auth: string }

async function runLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

// Sends each message to every device its member has subscribed. It never throws: push is a
// nicety on top of an action that has already succeeded, so a failure is only logged. A push
// service answering 404 or 410 means that subscription is gone for good, so its row is deleted; any
// other failure is counted against the device, which is pruned once it keeps failing (0076).
export async function sendPush(messages: PushMessage[], client?: DbClient): Promise<PushResult> {
  const keys = vapidKeys()
  if (!keys || messages.length === 0) return NONE

  try {
    const db = client ?? serviceRoleClient()
    const profileIds = [...new Set(messages.map((m) => m.profileId))]
    const subscriptions: Subscription[] = []
    for (const ids of chunk(profileIds, IN_CHUNK)) {
      const { data, error } = await db
        .from('push_subscriptions')
        .select('id, profile_id, endpoint, p256dh, auth')
        .in('profile_id', ids)
      if (error) throw error
      subscriptions.push(...data)
    }

    // The database only stores push-service endpoints (0067); this is the second line, so the
    // service role never POSTs anywhere else even if a row somehow got past the first.
    const stray = subscriptions.filter((s) => !isPushEndpoint(s.endpoint))
    if (stray.length > 0) console.error('Skipping push subscriptions with non-push endpoints', stray.map((s) => s.id))
    const sendable = subscriptions.filter((s) => isPushEndpoint(s.endpoint))

    const jobs = messages.flatMap((message) =>
      sendable.filter((s) => s.profile_id === message.profileId).map((subscription) => ({ subscription, message })),
    )
    const delivered = new Set<string>()
    const failedIds = new Set<string>()
    const gone = new Set<string>()
    let sent = 0
    let failed = 0
    let systemic = 0

    await runLimited(jobs, CONCURRENCY, async ({ subscription, message }) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message.payload),
          { vapidDetails: { subject: VAPID_SUBJECT, ...keys }, TTL: TTL_SECONDS, timeout: 10_000 },
        )
        delivered.add(subscription.id)
        sent++
      } catch (error) {
        const status = (error as { statusCode?: number } | null)?.statusCode
        if (status === 404 || status === 410) {
          gone.add(subscription.id)
        } else {
          failed++
          // Only a 4xx the device caused (400, 413 and the like) counts against it. 401 and 403 mean
          // the push service rejects our VAPID credentials, which hits every device alike, and no
          // status, 429 and 5xx are the service's or ours: none of those may ever prune a device.
          if (status !== undefined && status >= 400 && status < 500 && status !== 429 && status !== 401 && status !== 403) {
            failedIds.add(subscription.id)
          } else {
            systemic++
          }
          console.error('Push send failed', status ?? error)
        }
      }
    })

    for (const ids of chunk([...gone], IN_CHUNK)) {
      const { error } = await db.from('push_subscriptions').delete().in('id', ids)
      if (error) console.error('Removing expired push subscriptions failed', error)
    }
    // Outcomes go to the database, which resets a delivered device's failure streak, extends a failed
    // one's, and prunes a device that has kept failing (0076), so a dead endpoint isn't retried for ever.
    const outcomes = [
      ...chunk([...delivered], IN_CHUNK).map((ids) => ({ p_delivered: ids, p_failed: [] as string[] })),
      ...chunk([...failedIds], IN_CHUNK).map((ids) => ({ p_delivered: [] as string[], p_failed: ids })),
    ]
    for (const args of outcomes) {
      const { error } = await db.rpc('record_push_results', args)
      if (error) console.error('Recording push outcomes failed', error)
    }

    return { sent, removed: gone.size, failed, systemic }
  } catch (error) {
    console.error('Push send failed', error)
    return { ...NONE, failed: messages.length, systemic: messages.length }
  }
}
