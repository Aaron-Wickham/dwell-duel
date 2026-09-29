import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { sendClosingAlerts } from '@/lib/push/notify'

// Tells a market's creator, and every admin, once it has closed with no result (#123). A market
// closing is only the clock passing, so nothing in the database fires; .github/workflows/
// closing-alerts.yml calls this every ten minutes with the same CRON_SECRET the daily cron uses,
// because Vercel Hobby can't run a cron more than once a day. Each market is claimed in push_log
// as it's sent, so calling it as often as you like never repeats a push.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const result = await sendClosingAlerts(serviceRoleClient())
  if ('error' in result) {
    console.error(result.error)
    return new NextResponse('Closing alerts failed', { status: 502 })
  }
  return NextResponse.json({ ok: true, ...result })
}
