import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { sendClosingAlerts } from '@/lib/push/notify'
import { CLOSING_ALERTS_JOB } from '@/lib/admin/cron-health'

// Tells a market's creator, and every admin, once it has closed with no result (#123). A market
// closing is only the clock passing, so no trigger fires; pg_cron's closing-alerts job (0064) calls
// this within a minute of a close, and at least every ten minutes, with the same CRON_SECRET the
// daily cron uses, because Vercel Hobby can't run a cron more than once a day.
// .github/workflows/closing-alerts.yml backs it up (GitHub drops most runs of a ten-minute
// schedule, #189). Each market is claimed in push_log once a device has taken its push (#207), so
// calling it as often as you like never repeats a push, and a failed push is tried again. Each
// successful run is recorded in cron_heartbeats (#149), and the Admin pages warn when the last one
// is too old; a run that delivered nothing it tried to isn't a success, so it leaves the heartbeat
// alone and the same warning shows.
//
// Five database calls and the sends themselves can take a while: fine under Fluid compute, fatal
// under the legacy 10s limit.
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const db = serviceRoleClient()
  const result = await sendClosingAlerts(db)
  if ('error' in result) {
    console.error(result.error)
    return new NextResponse('Closing alerts failed', { status: 502 })
  }
  if (result.sent === 0 && result.failed > 0) {
    console.error(`Closing alerts: every push failed (${result.failed})`)
    return new NextResponse('Push delivery failed', { status: 502 })
  }

  // Only this route stamps the heartbeat, not the daily keep-alive that sends the same alerts: the
  // Admin warning is about this frequent schedule, and a daily stamp would hide it being dead.
  const { error: heartbeatErr } = await db.rpc('record_cron_heartbeat', { p_name: CLOSING_ALERTS_JOB })
  if (heartbeatErr) {
    console.error(heartbeatErr)
    return new NextResponse('Heartbeat failed', { status: 502 })
  }
  return NextResponse.json({ ok: true, ...result })
}
