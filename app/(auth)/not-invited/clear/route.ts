import { NextResponse } from 'next/server'
import { NOT_INVITED_EMAIL_COOKIE, NOT_INVITED_PATH } from '@/lib/auth/not-invited'

// Clears the refused email once /not-invited has shown it. A route handler, not a Server Action:
// an action that changes a cookie makes Next re-render the page, which would take the email away
// as soon as it appeared.
export async function POST() {
  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(NOT_INVITED_EMAIL_COOKIE, '', { path: NOT_INVITED_PATH, maxAge: 0, httpOnly: true, sameSite: 'lax' })
  return response
}
