import { scrubEvent } from '@/lib/observability/scrub'

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

// Errors only: no tracing, replay, logs or default PII, so the free tier and the bundle stay small.
export function sentryOptions() {
  return {
    dsn: SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SW_VERSION,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  }
}
