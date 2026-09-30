// The browser's Sentry, loaded once and lazily, only when a DSN was set at build. Everything that
// reports waits on the same promise, so an error raised before the SDK is ready is sent once it is
// instead of dropped.
let loading: Promise<typeof import('@sentry/nextjs')> | undefined
let sent = 0
const MAX_PER_PAGE_LOAD = 10

export function loadClientSentry() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return undefined
  loading ??= Promise.all([import('@sentry/nextjs'), import('@/lib/observability/sentry-options')]).then(([Sentry, { sentryOptions }]) => {
    Sentry.init({ ...sentryOptions(), integrations: [Sentry.globalHandlersIntegration()], defaultIntegrations: false })
    return Sentry
  })
  return loading
}

export function reportClientError(error: unknown): void {
  if (sent >= MAX_PER_PAGE_LOAD) return
  sent += 1
  void loadClientSentry()?.then((Sentry) => Sentry.captureException(error)).catch(() => {})
}
