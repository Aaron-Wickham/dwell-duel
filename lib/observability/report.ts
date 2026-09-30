import { after } from 'next/server'
import { captureException, flush } from '@sentry/nextjs'
import { SENTRY_DSN } from '@/lib/observability/sentry-options'

// Server-side: log an error we handled (so it can't vanish with Vercel Hobby's one-hour logs) and
// send it to Sentry when a DSN is set. Sentry is off without one, and this is then just console.error.
export function reportError(context: string, error: unknown): void {
  console.error(context, error)
  if (!SENTRY_DSN) return
  captureException(error, { tags: { context } })
  // A serverless function can freeze before the SDK has sent; after() outlives the response.
  // Outside a request (a test, a script) there's no after(), and nothing is waiting anyway.
  try {
    after(() => flush(2000))
  } catch {}
}

// For a route that knows it's about to answer: wait for what reportError captured.
export async function flushErrors(): Promise<void> {
  if (SENTRY_DSN) await flush(2000).catch(() => false)
}
