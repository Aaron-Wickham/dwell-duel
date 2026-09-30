import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/auth/cron-secret'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { sendClosingAlerts } from '@/lib/push/notify'

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
 */
// Five database calls, a Storage remove of up to 500 objects, settle_season and the pushes can
// take tens of seconds: fine under Fluid compute, fatal under the legacy 10s limit.
export const maxDuration = 60

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const db = serviceRoleClient()
  const { error } = await db.from('profiles').select('id').limit(1)

  if (error) {
    console.error(error)
    return new NextResponse('Supabase query failed', { status: 502 })
  }

  // Proof files uploaded but never attached (an abandoned form) are removed a day later (0046).
  // Storage objects can only be deleted through the Storage API, not SQL.
  const { data: stray, error: strayErr } = await db.rpc('stray_proof_objects', { p_limit: 500 })
  const names = ((stray ?? []) as { name: string }[]).map((r) => r.name)
  if (!strayErr && names.length > 0) {
    const { error: removeErr } = await db.storage.from('proof').remove(names)
    if (removeErr) {
      console.error(removeErr)
      return new NextResponse('Proof cleanup failed', { status: 502 })
    }
  }
  if (strayErr) {
    console.error(strayErr)
    return new NextResponse('Proof cleanup failed', { status: 502 })
  }

  // A key only has to outlive a retry of the same attempt (#61), so a day is plenty.
  const { error: keysErr } = await db
    .from('idempotency_keys')
    .delete()
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  if (keysErr) {
    console.error(keysErr)
    return new NextResponse('Key cleanup failed', { status: 502 })
  }

  // Last month's champion goes to the feed (#77). Every day, not just the 1st, so a missed run
  // still posts it; settle_season writes the event at most once per month.
  const { data: champion, error: seasonErr } = await db.rpc('settle_season')
  if (seasonErr) {
    console.error(seasonErr)
    return new NextResponse('Season settle failed', { status: 502 })
  }

  // A creator whose market has closed is asked to resolve it, and admins are told, once per market
  // (#80, #123). Vercel Hobby runs this cron once a day, so it's the daily backstop: closing-alerts,
  // called by Supabase's pg_cron within a minute of a market closing, is what normally sends them.
  const alerts = await sendClosingAlerts(db)
  if ('error' in alerts) {
    console.error(alerts.error)
    return new NextResponse('Resolve reminders failed', { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    strayProofRemoved: names.length,
    seasonChampion: champion ?? null,
    resolveReminders: alerts.reminded,
    marketAlerts: alerts.alerted,
  })
}
