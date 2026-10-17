// Client errors go to Sentry only when a DSN is set; see lib/observability/client.ts.
import { startClientSentryWhenIdle } from '@/lib/observability/client'

startClientSentryWhenIdle()
