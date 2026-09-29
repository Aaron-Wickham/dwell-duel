import 'server-only'
import { after } from 'next/server'
import type { DbClient } from '@/lib/supabase/database'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { vapidKeys } from './config'
import { marketResultPayload, newMarketPayload, resolveReminderPayload, taskReviewPayload } from './messages'
import { sendPush, type PushResult } from './send'

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

export async function notifyNewMarket(marketId: string, db: DbClient = serviceRoleClient()): Promise<PushResult | null> {
  const { data, error } = await db.rpc('push_new_market', { p_market_id: marketId })
  if (error) {
    console.error('Reading new market recipients failed', error)
    return null
  }
  return sendPush(data.map((row) => ({ profileId: row.profile_id, payload: newMarketPayload({ marketId, title: row.title }) })), db)
}

// The daily cron's reminders. push_resolve_reminders claims each market as it returns it, so a
// failed read is the caller's to report, and a market is never reminded about twice.
export async function sendResolveReminders(db: DbClient): Promise<{ error: unknown } | { reminded: number }> {
  if (!vapidKeys()) return { reminded: 0 }
  const { data, error } = await db.rpc('push_resolve_reminders')
  if (error) return { error }
  await sendPush(
    data.map((row) => ({ profileId: row.profile_id, payload: resolveReminderPayload({ marketId: row.market_id, title: row.title }) })),
    db,
  )
  return { reminded: data.length }
}
