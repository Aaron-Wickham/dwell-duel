import 'server-only'
import { after } from 'next/server'
import type { DbClient } from '@/lib/supabase/database'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { vapidKeys } from './config'
import {
  marketAlertPayload,
  marketResultPayload,
  newMarketPayload,
  resolveReminderPayload,
  taskAlertPayload,
  taskReviewPayload,
} from './messages'
import { sendPush, type PushMessage, type PushResult } from './send'

// Runs once the member's action has answered, so push never slows or fails it. Without the VAPID
// keys there's nothing to send, so nothing is scheduled at all.
export function afterAction(task: () => Promise<unknown>): void {
  if (!vapidKeys()) return
  after(async () => {
    try {
      await task()
    } catch (error) {
      console.error('Push notification failed', error)
    }
  })
}

// Recipients are read after the RPC has committed, so they reflect the result just written:
// a resolve, an override or a void.
export async function notifyMarketResult(marketId: string, db: DbClient = serviceRoleClient()): Promise<PushResult | null> {
  const { data, error } = await db.rpc('push_market_result', { p_market_id: marketId })
  if (error) {
    console.error('Reading market result recipients failed', error)
    return null
  }
  return sendPush(
    data.map((row) => ({
      profileId: row.profile_id,
      payload: marketResultPayload(marketId, {
        title: row.title,
        status: row.status,
        outcomeLabel: row.outcome_label,
        isOverride: row.is_override,
        won: Number(row.won),
        refunded: Number(row.refunded),
        hasSolo: row.has_solo,
      }),
    })),
    db,
  )
}

export async function notifyTaskReviews(completionIds: string[], db: DbClient = serviceRoleClient()): Promise<PushResult | null> {
  if (completionIds.length === 0) return null
  const { data, error } = await db.rpc('push_task_reviews', { p_completion_ids: completionIds })
  if (error) {
    console.error('Reading task review recipients failed', error)
    return null
  }
  return sendPush(
    data.map((row) => ({
      profileId: row.profile_id,
      payload: taskReviewPayload({
        taskTitle: row.task_title,
        status: row.status,
        rewardAmount: row.reward_amount,
        reviewNote: row.review_note,
      }),
    })),
    db,
  )
}

// PostgREST returns at most max_rows (1000) rows per request, so the recipients are read a page at
// a time, after the last profile_id (push_new_market orders by it), until a page comes back short.
// A page that fails to load is logged and the read stops there: the members already read still
// hear about the market, rather than nobody.
export const NEW_MARKET_PAGE = 1000

export async function notifyNewMarket(marketId: string, db: DbClient = serviceRoleClient()): Promise<PushResult | null> {
  const recipients: { profile_id: string; title: string }[] = []
  for (;;) {
    let query = db.rpc('push_new_market', { p_market_id: marketId }).select('profile_id, title')
    const last = recipients.at(-1)
    if (last) query = query.gt('profile_id', last.profile_id)
    const { data, error } = await query.order('profile_id').limit(NEW_MARKET_PAGE)
    if (error) {
      console.error(`Reading new market recipients failed after ${recipients.length} of them; sending to those`, error)
      if (recipients.length === 0) return null
      break
    }
    recipients.push(...data)
    if (data.length < NEW_MARKET_PAGE) break
  }
  return sendPush(recipients.map((row) => ({ profileId: row.profile_id, payload: newMarketPayload({ marketId, title: row.title }) })), db)
}

export type ClosingAlertsDelivery = { sent: number; failed: number }
type ClosingAlertsResult<K extends string> = { error: unknown } | ({ [P in K]: number } & ClosingAlertsDelivery)

type PerMarketMessage = PushMessage & { marketId: string }

// One market at a time, so each market's claim follows its own delivery (#207): a market is written
// to push_log only once at least one device took the push, and a market whose sends all failed is
// due again next run. `on conflict do nothing` in claim_push_log makes a race between two callers
// harmless. A market whose recipients turned out to have no live device (every subscription gone)
// isn't claimed either; push_wants stops offering it until they subscribe again.
async function deliverPerMarket(
  db: DbClient,
  kind: 'resolve_reminder' | 'market_alert',
  messages: PerMarketMessage[],
): Promise<{ error: unknown } | { markets: number; sent: number; failed: number }> {
  const byMarket = new Map<string, PushMessage[]>()
  for (const { marketId, ...message } of messages) byMarket.set(marketId, [...(byMarket.get(marketId) ?? []), message])

  const delivered: string[] = []
  let sent = 0
  let failed = 0
  for (const [marketId, group] of byMarket) {
    const result = await sendPush(group, db)
    sent += result.sent
    failed += result.failed
    if (result.sent > 0) delivered.push(marketId)
  }
  if (delivered.length === 0) return { markets: 0, sent, failed }

  const { error } = await db.rpc('claim_push_log', { p_kind: kind, p_refs: delivered })
  if (error) return { error }
  return { markets: delivered.length, sent, failed }
}

// The closing-alerts reminders. due_resolve_reminders (0071) only reads, so a failed read is the
// caller's to report; a market is reminded about once because it's claimed after its delivery.
export async function sendResolveReminders(db: DbClient): Promise<ClosingAlertsResult<'reminded'>> {
  if (!vapidKeys()) return { reminded: 0, sent: 0, failed: 0 }
  const { data, error } = await db.rpc('due_resolve_reminders')
  if (error) return { error }
  const result = await deliverPerMarket(
    db,
    'resolve_reminder',
    data.map((row) => ({
      marketId: row.market_id,
      profileId: row.profile_id,
      payload: resolveReminderPayload({ marketId: row.market_id, title: row.title }),
    })),
  )
  if ('error' in result) return result
  return { reminded: result.markets, sent: result.sent, failed: result.failed }
}

// Reviewers and above hear about a submission the moment it's made. The submitter is left out in SQL.
export async function notifyTaskSubmitted(completionId: string, db: DbClient = serviceRoleClient()): Promise<PushResult | null> {
  const { data, error } = await db.rpc('push_task_alerts', { p_completion_id: completionId })
  if (error) {
    console.error('Reading task alert recipients failed', error)
    return null
  }
  return sendPush(
    data.map((row) => ({
      profileId: row.profile_id,
      payload: taskAlertPayload({ taskTitle: row.task_title, submitterName: row.submitter_name }),
    })),
    db,
  )
}

// Admins hear once about each market that has closed with no result. Like the creator's reminder,
// due_market_alerts only reads, and a market is claimed once an admin's device has the alert.
export async function sendMarketAlerts(db: DbClient): Promise<ClosingAlertsResult<'alerted'>> {
  if (!vapidKeys()) return { alerted: 0, sent: 0, failed: 0 }
  const { data, error } = await db.rpc('due_market_alerts')
  if (error) return { error }
  const result = await deliverPerMarket(
    db,
    'market_alert',
    data.map((row) => ({
      marketId: row.market_id,
      profileId: row.profile_id,
      payload: marketAlertPayload({ marketId: row.market_id, title: row.title }),
    })),
  )
  if ('error' in result) return result
  return { alerted: result.markets, sent: result.sent, failed: result.failed }
}

// Everything the schedule sends: the creator's reminder and the admins' alert, each claimed
// once per market, so running it as often as you like never repeats a push. `sent` and `failed`
// count devices, so a caller can tell a quiet run from one that delivered nothing it tried.
export async function sendClosingAlerts(
  db: DbClient,
): Promise<{ error: unknown } | ({ reminded: number; alerted: number } & ClosingAlertsDelivery)> {
  const reminders = await sendResolveReminders(db)
  if ('error' in reminders) return reminders
  const alerts = await sendMarketAlerts(db)
  if ('error' in alerts) return alerts
  return {
    reminded: reminders.reminded,
    alerted: alerts.alerted,
    sent: reminders.sent + alerts.sent,
    failed: reminders.failed + alerts.failed,
  }
}
