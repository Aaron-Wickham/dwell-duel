import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/auth/cron-secret'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { sendClosingAlerts } from '@/lib/push/notify'
import { flushErrors, reportError } from '@/lib/observability/report'
import { pingHeartbeat } from '@/lib/observability/heartbeat'
import { CLOSING_ALERTS_JOB } from '@/lib/admin/cron-health'

// Tells a market's creator, and every admin, once it has closed with no result (#123). A market
// closing is only the clock passing, so no trigger fires; pg_cron's closing-alerts job (0064) calls
// this within a minute of a close, and at least every ten minutes, with the same CRON_SECRET the
// daily cron uses, because Vercel Hobby can't run a cron more than once a day.
// .github/workflows/closing-alerts.yml backs it up (GitHub drops most runs of a ten-minute
// schedule, #189). Each market is claimed in push_log once a device has taken its push (#207), so
// calling it as often as you like never repeats a push, and a failed push is tried again. Each
// run that read its queue is recorded in cron_heartbeats (#149), and the Admin pages warn when the
// last one is too old, so the warning means "the schedule is dead". A push that failed is logged and
// counted in the response instead, since one broken device would otherwise keep the warning on, and
// the backup workflow failing, for as long as it stayed subscribed (#257); a device that keeps
// failing is pruned by record_push_results (0076). A run that delivered nothing while any failure was
// systemic (credentials, network, 5xx) fails and leaves the heartbeat alone. One run at a time: a caller
// that finds another's lease returns at once.
//
// Five database calls and the sends themselves can take a while: fine under Fluid compute, fatal
// under the legacy 10s limit.
export const maxDuration = 60

// Every answer pings the optional healthchecks.io check (#256): a healthy run its URL, a 502 its
// /fail, so a dead schedule shows as a late ping and a broken one as a failure.
async function answer(ok: boolean, response: NextResponse): Promise<NextResponse> {
  await pingHeartbeat(process.env.HEALTHCHECKS_CLOSING_ALERTS_URL, ok)
  await flushErrors()
  return response
}

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const db = serviceRoleClient()
  const result = await sendClosingAlerts(db)
  if ('error' in result) {
    reportError('Closing alerts failed', result.error)
    return answer(false, new NextResponse('Closing alerts failed', { status: 502 }))
  }
  // Another run holds the lease and is doing this work, so this one neither pings nor stamps.
  if (result.busy) return NextResponse.json({ ok: true, ...result })
  // A device the push service rejects is pruned by the database and is no alarm. A run that delivered
  // nothing while any failure was systemic (our credentials, our network, the push service) must not
  // look healthy, so it fails and leaves the heartbeat alone (#257). Counted over the whole run, not
  // per market, so a one-device group alarms too.
  if (result.sent === 0 && result.systemic > 0) {
    reportError('Closing alerts failed', new Error(`nothing delivered, ${result.systemic} systemic push failure(s)`))
    return answer(false, new NextResponse('Push delivery failed', { status: 502 }))
  }
  if (result.failed > 0) console.error(`Closing alerts: ${result.failed} push(es) failed, ${result.sent} sent`)

  // Only this route stamps the heartbeat, not the daily keep-alive that sends the same alerts: the
  // Admin warning is about this frequent schedule, and a daily stamp would hide it being dead.
  const { error: heartbeatErr } = await db.rpc('record_cron_heartbeat', { p_name: CLOSING_ALERTS_JOB })
  if (heartbeatErr) {
    reportError('Closing alerts heartbeat failed', heartbeatErr)
    return answer(false, new NextResponse('Heartbeat failed', { status: 502 }))
  }
  return answer(true, NextResponse.json({ ok: true, ...result }))
}
