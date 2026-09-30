import { after } from 'next/server'
import { SENTRY_DSN } from '@/lib/observability/sentry-options'

type Sentry = typeof import('@sentry/nextjs')

// Captures still being handed to the SDK, so a route that's about to answer can wait for them.
const pending: Promise<Sentry | null>[] = []

// Server-side: log an error we handled (so it can't vanish with Vercel Hobby's one-hour logs) and
// send it to Sentry when a DSN is set. Sentry is off without one, and this is then just
// console.error; the SDK is imported only then, so a cold start without a DSN never loads it.
export function reportError(context: string, error: unknown): void {
  console.error(context, error)
  if (!SENTRY_DSN) return
  const captured = import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(error, { tags: { context } })
      return Sentry
    })
    .catch(() => null)
  pending.push(captured)
  // A serverless function can freeze before the SDK has sent; after() outlives the response.
  // Outside a request (a test, a script) there's no after(), and nothing is waiting anyway.
  try {
    after(flushErrors)
  } catch {}
}

// For a route that knows it's about to answer: wait for what reportError captured.
export async function flushErrors(): Promise<void> {
  if (!SENTRY_DSN) return
  const sdks = await Promise.all(pending.splice(0))
  await sdks.find(Boolean)?.flush(2000).catch(() => false)
}
