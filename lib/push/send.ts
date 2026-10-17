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
  // 401/403 answers held back for the caller to judge (only with a `run`, see PushRun).
  credentials: number
}

type Subscription = { id: string; profile_id: string; endpoint: string; p256dh: string; auth: string }

// Whether a 401/403 is the device's or ours depends on the whole run: if any push was delivered, our
// credentials are fine and that device holds a subscription made with an older key (device-caused);
// if nothing was delivered, it is our credentials (systemic). A run collects the answers across
// several sends, and the caller settles them once it knows (settleCredentialFailures).
export interface PushRun {
  sent: number
  credentialIds: string[]
  credentialCount: number
  credentialMarkets: { kind: string; ref: string }[]
  // Each member's devices, read once per run and shared by its sends, so the reminders and the
  // alerts don't read the same member twice; a device found gone is dropped from it.
  subscriptions?: Map<string, Subscription[]>
}

// A handful at a time: push services throttle bursts.
const CONCURRENCY = 6
// A result a day late is still news; a reminder older than that isn't worth waking a phone for.
const TTL_SECONDS = 24 * 60 * 60
const NONE: PushResult = { sent: 0, removed: 0, failed: 0, systemic: 0, credentials: 0 }

async function runLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function readSubscriptions(db: DbClient, profileIds: string[], cache?: Map<string, Subscription[]>): Promise<Map<string, Subscription[]>> {
  const byProfile = new Map<string, Subscription[]>()
  const unread: string[] = []
  for (const id of profileIds) {
    const cached = cache?.get(id)
    if (cached) byProfile.set(id, cached)
    else unread.push(id)
  }
  const read: Subscription[] = []
  for (const ids of chunk(unread, IN_CHUNK)) {
    const { data, error } = await db.from('push_subscriptions').select('id, profile_id, endpoint, p256dh, auth').in('profile_id', ids)
    if (error) throw error
    read.push(...data)
  }

  // The database only stores push-service endpoints (0067); this is the second line, so the
  // service role never POSTs anywhere else even if a row somehow got past the first.
  const stray = read.filter((s) => !isPushEndpoint(s.endpoint))
  if (stray.length > 0) console.error('Skipping push subscriptions with non-push endpoints', stray.map((s) => s.id))
  for (const id of unread) byProfile.set(id, [])
  for (const s of read) if (isPushEndpoint(s.endpoint)) byProfile.get(s.profile_id)?.push(s)
  for (const id of unread) cache?.set(id, byProfile.get(id)!)
  return byProfile
}

// Sends each message to every device its member has subscribed. It never throws: push is a
// nicety on top of an action that has already succeeded, so a failure is only logged. A push
// service answering 404 or 410 means that subscription is gone for good, so its row is deleted; any
// other failure is counted against the device, which is pruned once it keeps failing (0076).
export async function sendPush(messages: PushMessage[], client?: DbClient, run?: PushRun): Promise<PushResult> {
  return (await sendPushGroups([messages], client, run))[0]
}

type Tally = { sent: number; removed: number; failed: number; systemic: number; credentialIds: Set<string> }

// sendPush for several groups at once (the closing alerts' markets, #455), each with its own result
// so the caller still judges each group's delivery alone. The groups share one subscription read,
// one capped pool of sends and one write of the outcomes, instead of a round of each per group.
export async function sendPushGroups(groups: PushMessage[][], client?: DbClient, run?: PushRun): Promise<PushResult[]> {
  const keys = vapidKeys()
  const messages = groups.flat()
  if (!keys || messages.length === 0) return groups.map(() => NONE)

  try {
    const db = client ?? serviceRoleClient()
    const byProfile = await readSubscriptions(db, [...new Set(messages.map((m) => m.profileId))], run?.subscriptions)

    const tallies: Tally[] = groups.map(() => ({ sent: 0, removed: 0, failed: 0, systemic: 0, credentialIds: new Set() }))
    const jobs = groups.flatMap((group, index) =>
      group.flatMap((message) => (byProfile.get(message.profileId) ?? []).map((subscription) => ({ tally: tallies[index], subscription, message }))),
    )
    const delivered = new Set<string>()
    const failedIds = new Set<string>()
    const gone = new Set<string>()

    await runLimited(jobs, CONCURRENCY, async ({ tally, subscription, message }) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message.payload),
          { vapidDetails: { subject: VAPID_SUBJECT, ...keys }, TTL: TTL_SECONDS, timeout: 10_000 },
        )
        delivered.add(subscription.id)
        tally.sent++
      } catch (error) {
        const status = (error as { statusCode?: number } | null)?.statusCode
        if (status === 404 || status === 410) {
          if (!gone.has(subscription.id)) tally.removed++
          gone.add(subscription.id)
        } else {
          tally.failed++
          // Only a 4xx the device caused (400, 413 and the like) counts against it. No status, 429 and
          // 5xx are the service's or ours and never prune a device. 401 and 403 could be either: see PushRun.
          if (status === 401 || status === 403) {
            tally.credentialIds.add(subscription.id)
          } else if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
            failedIds.add(subscription.id)
          } else {
            tally.systemic++
          }
          console.error('Push send failed', status ?? error)
        }
      }
    })

    const sent = tallies.reduce((total, t) => total + t.sent, 0)
    if (run) run.sent += sent
    const results = tallies.map(({ credentialIds, ...tally }): PushResult => {
      if (credentialIds.size === 0) return { ...tally, credentials: 0 }
      if (run) {
        run.credentialIds.push(...credentialIds)
        run.credentialCount += credentialIds.size
        return { ...tally, credentials: credentialIds.size }
      }
      if (sent > 0) {
        for (const id of credentialIds) failedIds.add(id)
        return { ...tally, credentials: 0 }
      }
      return { ...tally, systemic: tally.systemic + credentialIds.size, credentials: 0 }
    })

    if (gone.size > 0 && run?.subscriptions) {
      for (const [profileId, subscriptions] of run.subscriptions) {
        run.subscriptions.set(profileId, subscriptions.filter((s) => !gone.has(s.id)))
      }
    }
    for (const ids of chunk([...gone], IN_CHUNK)) {
      const { error } = await db.from('push_subscriptions').delete().in('id', ids)
      if (error) console.error('Removing expired push subscriptions failed', error)
    }
    // Outcomes go to the database, which resets a delivered device's failure streak, extends a failed
    // one's, and prunes a device that has kept failing (0076), so a dead endpoint isn't retried for ever.
    // Both lists share a call, which applies the deliveries before the failures.
    const deliveredIds = [...delivered]
    const failed = [...failedIds]
    for (let i = 0; i < Math.max(deliveredIds.length, failed.length); i += IN_CHUNK) {
      const { error } = await db.rpc('record_push_results', {
        p_delivered: deliveredIds.slice(i, i + IN_CHUNK),
        p_failed: failed.slice(i, i + IN_CHUNK),
      })
      if (error) console.error('Recording push outcomes failed', error)
    }

    return results
  } catch (error) {
    console.error('Push send failed', error)
    return groups.map((group) => ({ ...NONE, failed: group.length, systemic: group.length }))
  }
}
