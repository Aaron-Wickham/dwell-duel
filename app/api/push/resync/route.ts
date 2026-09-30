import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { savePushSubscriptionAction } from '@/lib/push/actions'

// The service worker's `pushsubscriptionchange` handler (public/sw.js) posts a browser's new
// subscription here, because a worker can't call a server action. It is the same save Settings
// makes, for the signed-in member. JSON only, so another site's form can't post to it.
export async function POST(request: Request) {
  const { user } = await requireUser()
  if (!user) return new NextResponse('Not signed in', { status: 401 })
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return new NextResponse('Expected JSON', { status: 415 })
  }

  const body: unknown = await request.json().catch(() => null)
  const result = await savePushSubscriptionAction(body)
  if (result.error) return new NextResponse(result.error, { status: 400 })
  return NextResponse.json({ ok: true })
}
