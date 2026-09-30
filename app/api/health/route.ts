import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { reportError } from '@/lib/observability/report'

// For an external uptime monitor: 200 only when the app can reach Supabase. One id from one row,
// no member data in the answer, and never cached, or the monitor would see a stale 200.
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const { error } = await serviceRoleClient().from('profiles').select('id').limit(1)
    if (error) throw error
    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    reportError('Health check failed', error)
    return NextResponse.json({ ok: false }, { status: 503, headers })
  }
}
