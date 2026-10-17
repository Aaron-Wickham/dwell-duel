// The browser's Sentry, loaded once and lazily, only when a DSN was set at build. Everything that
// reports waits on the same promise, so an error raised before the SDK is ready is sent once it is
// instead of dropped.
let loading: Promise<typeof import('@sentry/nextjs')> | undefined
let sent = 0
let stopEarlyCapture: (() => void) | undefined
const MAX_PER_PAGE_LOAD = 10
// The longest the SDK waits for the main thread to go idle, and the wait where the browser has no
// requestIdleCallback (Safari).
export const SENTRY_IDLE_TIMEOUT_MS = 3000

export function loadClientSentry() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return undefined
  loading ??= Promise.all([import('@sentry/nextjs'), import('@/lib/observability/sentry-options')]).then(([Sentry, { sentryOptions }]) => {
    Sentry.init({ ...sentryOptions(), integrations: [Sentry.globalHandlersIntegration()], defaultIntegrations: false })
    // Sentry's own handlers see every uncaught error from here, so ours would only send each twice.
    stopEarlyCapture?.()
    return Sentry
  })
  return loading
}

export function reportClientError(error: unknown): void {
  if (sent >= MAX_PER_PAGE_LOAD) return
  sent += 1
  void loadClientSentry()?.then((Sentry) => Sentry.captureException(error)).catch(() => {})
}

// Loading the SDK as the page loads competes with hydration on a phone (#458), so it waits until the
// browser is idle. Until then, an uncaught error is caught here and reported, which loads the SDK
// at once and sends the error when it's ready, so nothing raised early is lost.
export function startClientSentryWhenIdle(): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN || typeof window === 'undefined') return
  const onError = (event: ErrorEvent) => reportClientError(event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  stopEarlyCapture = () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    stopEarlyCapture = undefined
  }

  const start = () => void loadClientSentry()?.catch(() => {})
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: SENTRY_IDLE_TIMEOUT_MS })
  else setTimeout(start, SENTRY_IDLE_TIMEOUT_MS)
}
