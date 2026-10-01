import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/auth/cron-secret'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { sendClosingAlerts } from '@/lib/push/notify'
import { flushErrors, reportError } from '@/lib/observability/report'
import { pingHeartbeat } from '@/lib/observability/heartbeat'
import { pruneUninvitedUsers } from '@/lib/auth/prune-uninvited-users'

/**
 * Supabase pauses free-tier projects after 7 days with no database
 * activity. Triggered daily by vercel.json's cron entry, so a missed run
 * still leaves six days of margin, keeping the hosted project alive
 * between bursts of real usage.
 *
 * Verified the same way every guide for securing a Vercel cron route
 * documents: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to a
 * cron-triggered request when that env var is set on the project, so
 * anything else calling this path either doesn't know the secret or
 * isn't Vercel's own scheduler. cronAuthorized refuses an unset secret
 * outright and compares in constant time.
 *
 * The steps are unrelated housekeeping, so each runs whatever the others did (#259): a Storage
 * outage mustn't stop the champion post. Failures are reported at the end (502, Sentry, and the
 * heartbeat's fail ping), and a clean run pings the heartbeat, so a run that never happens shows
 * as a late ping.
 */
// Six database calls, a Storage remove of up to 500 objects, up to 50 Auth user deletes,
// settle_season and the pushes can take tens of seconds: fine under Fluid compute, fatal under the
// legacy 10s limit.
export const maxDuration = 60

type Db = ReturnType<typeof serviceRoleClient>

// A step returns its report, or throws; the runner turns a throw into a named failure.
const steps: { name: string; run: (db: Db) => Promise<Record<string, unknown>> }[] = [
  {
    name: 'database',
    run: async (db) => {
      const { error } = await db.from('profiles').select('id').limit(1)
      if (error) throw error
      return {}
    },
  },
  {
    // Proof files uploaded but never attached (an abandoned form) are removed a day later (0046).
    // Storage objects can only be deleted through the Storage API, not SQL.
    name: 'proof cleanup',
    run: async (db) => {
      const { data: stray, error } = await db.rpc('stray_proof_objects', { p_limit: 500 })
      if (error) throw error
      const names = ((stray ?? []) as { name: string }[]).map((r) => r.name)
      if (names.length > 0) {
        const { error: removeErr } = await db.storage.from('proof').remove(names)
        if (removeErr) throw removeErr
      }
      return { strayProofRemoved: names.length }
    },
  },
  {
    // A key only has to outlive a retry of the same attempt (#61), so a day is plenty.
    name: 'key cleanup',
    run: async (db) => {
      const { error } = await db
        .from('idempotency_keys')
        .delete()
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      if (error) throw error
      return {}
    },
  },
  {
    // Anyone can finish Google sign-in; the account of someone never invited is deleted a day
    // later (#275), 50 a run: plenty for a trickle of stray sign-ins, and a backlog clears over days.
    name: 'uninvited sign-in cleanup',
    run: async (db) => {
      const { removed, failed } = await pruneUninvitedUsers(db, 50)
      return { uninvitedUsersRemoved: removed, uninvitedUsersFailed: failed }
    },
  },
  {
    // Last month's champion goes to the feed (#77). Every day, not just the 1st, so a missed run
    // still posts it; settle_season writes the event at most once per month.
    name: 'season settle',
    run: async (db) => {
      const { data: champion, error } = await db.rpc('settle_season')
      if (error) throw error
      return { seasonChampion: champion ?? null }
    },
  },
  {
    // A creator whose market has closed is asked to resolve it, and admins are told, once per
    // market (#80, #123). Vercel Hobby runs this cron once a day, so it's the daily backstop:
    // closing-alerts, called by Supabase's pg_cron within a minute of a market closing, is what
    // normally sends them.
    name: 'resolve reminders',
    run: async (db) => {
      const alerts = await sendClosingAlerts(db)
      if ('error' in alerts) throw alerts.error
      return { resolveReminders: alerts.reminded, marketAlerts: alerts.alerted }
    },
  },
]

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const db = serviceRoleClient()
  const report: Record<string, unknown> = {}
  const failed: string[] = []
  for (const step of steps) {
    try {
      Object.assign(report, await step.run(db))
    } catch (error) {
      failed.push(step.name)
      reportError(`keep-alive: ${step.name} failed`, error)
    }
  }

  await pingHeartbeat(process.env.HEALTHCHECKS_KEEP_ALIVE_URL, failed.length === 0)
  await flushErrors()

  if (failed.length > 0) return NextResponse.json({ ok: false, failed, ...report }, { status: 502 })
  return NextResponse.json({ ok: true, ...report })
}
