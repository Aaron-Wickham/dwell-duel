import { after } from 'next/server'
import { SENTRY_DSN } from '@/lib/observability/sentry-options'

type Sentry = typeof import('@sentry/nextjs')

// Captures still being handed to the SDK, so a route that's about to answer can wait for them.
const pending: Promise<Sentry | null>[] = []

// A PostgREST or Auth error is a plain object, and Sentry turns one into a synthetic Error whose
// only frame is process.processTicksAndRejections and whose title is the bare message: a Supabase
// call that hit our fetch timeout read as "TimeoutError: The operation was aborted due to timeout"
// with nothing saying where. Wrapped, it names what failed and carries the caller's stack. Only the
// message and code go: `details` can quote member input.
export function reportable(context: string, error: unknown): Error {
  if (error instanceof Error) return error
  const fields = typeof error === 'object' && error !== null ? (error as { message?: unknown; code?: unknown }) : {}
  const message = typeof fields.message === 'string' ? fields.message : String(error)
  const code = typeof fields.code === 'string' && fields.code ? ` (${fields.code})` : ''
  const wrapped = new Error(`${context}: ${message}${code}`)
  Error.captureStackTrace?.(wrapped, reportError)
  return wrapped
}

// Server-side: log an error we handled (so it can't vanish with Vercel Hobby's one-hour logs) and
// send it to Sentry when a DSN is set. Sentry is off without one, and this is then just
// console.error; the SDK is imported only then, so a cold start without a DSN never loads it.
export function reportError(context: string, error: unknown): void {
  console.error(context, error)
  if (!SENTRY_DSN) return
  const exception = reportable(context, error)
  const captured = import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(exception, { tags: { context } })
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
