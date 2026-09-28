import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'

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

  return NextResponse.json({ ok: true, strayProofRemoved: names.length })
}
