// Client errors go to Sentry only when a DSN is set, and the SDK is loaded lazily so a member's
// first paint never waits on it (and a build without a DSN never downloads it).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void Promise.all([import('@sentry/nextjs'), import('@/lib/observability/sentry-options')])
    .then(([Sentry, { sentryOptions }]) => Sentry.init({ ...sentryOptions(), integrations: [Sentry.globalHandlersIntegration()], defaultIntegrations: false }))
    .catch(() => {})
}
