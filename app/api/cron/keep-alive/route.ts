import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'

/**
 * Supabase pauses free-tier projects after 7 days with no database
 * activity. Triggered Monday and Thursday by vercel.json's cron entry, so
 * one missed run still lands well inside that window, keeping the hosted
 * project alive between bursts of real usage.
 *
 * Verified the same way every guide for securing a Vercel cron route
 * documents: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to a
 * cron-triggered request when that env var is set on the project, so
 * anything else calling this path either doesn't know the secret or
 * isn't Vercel's own scheduler. The unset case is checked explicitly
 * (`!secret`) rather than relied on to fail via the string comparison
 * alone -- `` `Bearer ${undefined}` `` interpolates to the literal string
 * "Bearer undefined", which a request sending that exact header would
 * otherwise match.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { error } = await serviceRoleClient().from('profiles').select('id').limit(1)

  if (error) {
    console.error(error)
    return new NextResponse('Supabase query failed', { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
