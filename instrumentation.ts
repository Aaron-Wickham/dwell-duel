import type { Instrumentation } from 'next'
import { assertRequiredEnv, warnMissingEnv } from '@/lib/env/required'

export async function register() {
  assertRequiredEnv()
  warnMissingEnv()
  if (process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_RUNTIME === 'nodejs') {
    const [Sentry, { sentryOptions }] = await Promise.all([import('@sentry/nextjs'), import('@/lib/observability/sentry-options')])
    Sentry.init(sentryOptions())
  }
}

// Every uncaught error in a Server Component, route handler, server action or the proxy, with the
// route it happened on. Without a DSN it does nothing.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(error, request, context)
  await Sentry.flush(2000).catch(() => false)
}
