import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAppPath } from '@/lib/auth/app-paths'
import { fetchWithTimeout, SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
      global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // A page's own redirect('/sign-in') runs after its loading skeleton has streamed, so the
  // browser gets a 200 and a client-side hop. Redirecting here keeps it a real 307. Only
  // page loads: a server action posted without a session still reaches its own check.
  const isPageLoad = request.method === 'GET' || request.method === 'HEAD'
  if (!user && isPageLoad && isAppPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
